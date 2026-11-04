"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePolling } from "./use-polling";
import { usePathname, useRouter } from "next/navigation";
import { Box, Button, Flex, HStack, Link, Stack, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faBed, faBedPulse, faBoxesStacked, faBuilding, faCartShopping, faCashRegister, faChartLine, faClipboardCheck, faClockRotateLeft, faCoins, faFileInvoiceDollar, faFlask, faGaugeHigh, faHandHoldingDollar, faHospital, faHospitalUser, faHourglassHalf, faKitMedical, faVault, faNotesMedical, faPeopleGroup, faPrescriptionBottleMedical, faRightFromBracket, faRotateLeft, faShieldHalved, faTriangleExclamation, faTruckMedical, faUserDoctor, faUserTie, faVial, faXmark } from "@fortawesome/free-solid-svg-icons";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type Role = "OPERATOR" | "MANAGEMENT" | "LAB" | "MEDICAL_STORE";

// Grouped by task, in the order staff move through their day. `group` becomes the small section
// title in the sidebar; a role sees only its own links and only the groups that hold them.
const navigation: { label: string; icon: typeof faGaugeHigh; href: string; roles: Role[]; group: string }[] = [
  { label: "Dashboard", icon: faGaugeHigh, href: "/", roles: ["MANAGEMENT", "OPERATOR"], group: "Overview" },
  // Front desk
  { label: "Patients", icon: faPeopleGroup, href: "/patients", roles: ["OPERATOR"], group: "Front desk" },
  { label: "OPD desk", icon: faNotesMedical, href: "/opd", roles: ["OPERATOR"], group: "Front desk" },
  { label: "Minor emergency", icon: faKitMedical, href: "/emergency", roles: ["OPERATOR"], group: "Front desk" },
  { label: "Tests", icon: faFlask, href: "/diagnostics", roles: ["OPERATOR"], group: "Diagnostics" },
  { label: "Lab results", icon: faVial, href: "/results", roles: ["OPERATOR"], group: "Diagnostics" },
  { label: "Admissions", icon: faHospitalUser, href: "/admissions", roles: ["OPERATOR"], group: "In-patients" },
  { label: "Operation theater", icon: faBed, href: "/ot", roles: ["OPERATOR"], group: "In-patients" },
  // Management
  { label: "Billing & reports", icon: faFileInvoiceDollar, href: "/reports", roles: ["MANAGEMENT"], group: "Finance" },
  { label: "Payouts", icon: faFileInvoiceDollar, href: "/payouts", roles: ["MANAGEMENT"], group: "Finance" },
  { label: "Expenses", icon: faCoins, href: "/expenses", roles: ["MANAGEMENT"], group: "Finance" },
  { label: "Doctors", icon: faUserDoctor, href: "/doctors", roles: ["MANAGEMENT"], group: "People" },
  { label: "Employees", icon: faUserTie, href: "/employees", roles: ["MANAGEMENT"], group: "People" },
  { label: "User access", icon: faShieldHalved, href: "/users", roles: ["MANAGEMENT"], group: "People" },
  { label: "Rooms & beds", icon: faBed, href: "/rooms", roles: ["MANAGEMENT"], group: "Hospital" },
  { label: "Inventory", icon: faBed, href: "/inventory", roles: ["MANAGEMENT"], group: "Hospital" },
  { label: "Hospital settings", icon: faBuilding, href: "/hospital-settings", roles: ["MANAGEMENT"], group: "Hospital" },
  // Lab
  { label: "Lab dashboard", icon: faGaugeHigh, href: "/lab", roles: ["LAB"], group: "Laboratory" },
  { label: "Upload tests", icon: faVial, href: "/lab/upload", roles: ["LAB"], group: "Laboratory" },
  { label: "Test & Price Catalog", icon: faFlask, href: "/configuration", roles: ["LAB"], group: "Laboratory" },
  // Medical store
  { label: "Store dashboard", icon: faGaugeHigh, href: "/medical-store", roles: ["MEDICAL_STORE"], group: "Overview" },
  { label: "Sell medicine", icon: faCashRegister, href: "/medical-store/sell", roles: ["MEDICAL_STORE"], group: "Sales" },
  { label: "In-patients", icon: faBedPulse, href: "/medical-store/inpatients", roles: ["MEDICAL_STORE"], group: "Sales" },
  { label: "Sale returns", icon: faRotateLeft, href: "/medical-store/returns/sale", roles: ["MEDICAL_STORE"], group: "Sales" },
  { label: "Day closing", icon: faVault, href: "/medical-store/day-closing", roles: ["MEDICAL_STORE"], group: "Sales" },
  { label: "Medicine catalog", icon: faPrescriptionBottleMedical, href: "/medical-store/catalog", roles: ["MEDICAL_STORE"], group: "Stock" },
  { label: "Stock adjustments", icon: faTriangleExclamation, href: "/medical-store/adjustments", roles: ["MEDICAL_STORE"], group: "Stock" },
  { label: "Stock count", icon: faClipboardCheck, href: "/medical-store/stock-count", roles: ["MEDICAL_STORE"], group: "Stock" },
  { label: "Stock history", icon: faClockRotateLeft, href: "/medical-store/stock-history", roles: ["MEDICAL_STORE"], group: "Stock" },
  { label: "Expiry tracker", icon: faHourglassHalf, href: "/medical-store/expiry", roles: ["MEDICAL_STORE"], group: "Stock" },
  { label: "Reorder list", icon: faCartShopping, href: "/medical-store/reorder", roles: ["MEDICAL_STORE"], group: "Stock" },
  { label: "Purchase (stock in)", icon: faBoxesStacked, href: "/medical-store/purchase", roles: ["MEDICAL_STORE"], group: "Purchasing" },
  { label: "Suppliers", icon: faTruckMedical, href: "/medical-store/suppliers", roles: ["MEDICAL_STORE"], group: "Purchasing" },
  { label: "Supplier payments", icon: faHandHoldingDollar, href: "/medical-store/supplier-payments", roles: ["MEDICAL_STORE"], group: "Purchasing" },
  { label: "Purchase returns", icon: faRotateLeft, href: "/medical-store/returns/purchase", roles: ["MEDICAL_STORE"], group: "Purchasing" },
  { label: "Reports", icon: faChartLine, href: "/medical-store/reports", roles: ["MEDICAL_STORE"], group: "Reports" },
];

const roleLabels: Record<Role, string> = { OPERATOR: "Operator", MANAGEMENT: "Management", LAB: "Lab", MEDICAL_STORE: "Medical Store" };
// Shown under the hospital name, so each role sees which workspace it is in.
const roleWorkspace: Record<Role, string> = { OPERATOR: "Front desk", MANAGEMENT: "Management suite", LAB: "Laboratory", MEDICAL_STORE: "Medical store" };

type User = { id?: number; username: string; name?: string | null; role: Role; mustChangePassword?: boolean };
type HospitalSettings = { name: string; logoDataUrl?: string | null };

// How often an operator's browser asks whether the lab has uploaded a new result.
const RESULT_POLL_INTERVAL_MS = 20000;

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [userLoaded, setUserLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);
  // Small screens (below lg) hide the sidebar behind a menu button; this is its open state.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape closes the small-screen menu, like any other overlay.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    fetch("/api/hospital-settings")
      .then(async (response) => {
        if (response.ok) setHospitalSettings((await response.json()).settings);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (pathname === "/login") return;
    // Re-verify session on every navigation, but NEVER reset userLoaded back to false.
    // This keeps the sidebar mounted and stable — no flicker between pages.
    fetch("/api/auth/me").then(async (response) => {
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        // A one-time password reset must be replaced before the account can be used for
        // anything else — send them there regardless of what page they tried to open
        // (bookmark, back button, typed URL, etc.), except the change-password page itself.
        if (data.user?.mustChangePassword && pathname !== "/change-password") {
          router.replace("/change-password");
        }
      } else {
        setUser(null);
      }
    }).catch(() => undefined).finally(() => {
      setUserLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Poll for newly-uploaded lab results and toast the operator when one lands.
  const notifiedResultIdsRef = useRef<Set<number>>(new Set());
  const baselineEstablishedRef = useRef(false);

  const isOperator = user?.role === "OPERATOR";

  // Start from a clean slate whenever the signed-in role changes, so opening the app never replays old uploads.
  useEffect(() => {
    notifiedResultIdsRef.current = new Set();
    baselineEstablishedRef.current = false;
  }, [isOperator]);

  async function pollRecentResults() {
    try {
      const res = await fetch("/api/diagnostics/recent-results");
      if (res.status === 401) {
        // Session expired or was revoked (e.g. a password reset) while this tab sat idle
        // on the same page — the pathname-keyed auth-check effect won't notice until the
        // next navigation, so clear it here too (this also switches the polling off).
        setUser(null);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const results: { id: number; testName: string; patient: { name: string; mrNumber: string } }[] = data.results ?? [];

      if (!baselineEstablishedRef.current) {
        // First poll after login/mount: record what already exists without toasting,
        // so opening the app doesn't replay old uploads as fresh notifications.
        results.forEach((item) => notifiedResultIdsRef.current.add(item.id));
        baselineEstablishedRef.current = true;
        return;
      }

      for (const item of results) {
        if (!notifiedResultIdsRef.current.has(item.id)) {
          notifiedResultIdsRef.current.add(item.id);
          toast.info(`${item.testName} result uploaded for ${item.patient.name} (MR ${item.patient.mrNumber})`);
        }
      }
    } catch { /* ignore */ }
  }

  // One request at a time, none while the tab is hidden, and only for operators.
  usePolling(pollRecentResults, RESULT_POLL_INTERVAL_MS, { enabled: isOperator });

  if (pathname === "/login" || pathname === "/change-password" || pathname === "/dev") return <>{children}</>;

  // Don't render sidebar until we know the user's role to avoid wrong-nav flash. Before
  // `mounted` flips (the very first client render on every refresh) we still render this
  // same fixed sidebar-shaped skeleton rather than bare `children` — returning bare children
  // here for one frame, then swapping straight to the full fixed layout, is what caused the
  // sidebar-disappears / content-jumps-left flash on refresh.
  if (!mounted || !userLoaded) {
    return (
      <Flex position="fixed" inset="0" w="100vw" h="100vh" overflow="hidden" bg="#eef2f0">
        <Box
          as="aside"
          display={{ base: "none", lg: "block" }}
          w="264px"
          h="100vh"
          flexShrink="0"
          bg="#0e2a27"
          zIndex="50"
        />
        <Box flex="1" minW="0" h="100vh" overflowY="auto" bg="#eef2f0">
          {children}
        </Box>
      </Flex>
    );
  }

  const visibleNavigation = navigation.filter((item) => Boolean(user?.role) && item.roles.includes(user!.role));
  // The link for the current page is the longest one the path starts with, so detail pages
  // (/admissions/12) light up their section and "/medical-store" never outshines a store sub-page.
  const activeHref = visibleNavigation
    .map((item) => item.href)
    .filter((href) => pathname === href || (href !== "/" && Boolean(pathname?.startsWith(`${href}/`))))
    .sort((a, b) => b.length - a.length)[0];
  const activeItem = visibleNavigation.find((item) => item.href === activeHref);
  const navGroups = visibleNavigation.reduce<{ title: string; items: typeof visibleNavigation }[]>((groups, item) => {
    const group = groups.find((g) => g.title === item.group);
    if (group) group.items.push(item);
    else groups.push({ title: item.group, items: [item] });
    return groups;
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Clear the user immediately — the auth-check effect skips re-fetching /api/auth/me
      // while on /login, so without this the stale OPERATOR role would keep the lab-result
      // poll running against a session that was just deleted server-side, spamming 401s.
      setUser(null);
      setLoggingOut(false);
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Flex position="fixed" inset="0" w="100vw" h="100vh" overflow="hidden" bg="#eef2f0">
      {menuOpen && (
        <Box
          display={{ base: "block", lg: "none" }}
          position="fixed"
          inset="0"
          bg="rgba(8, 22, 20, 0.55)"
          zIndex="55"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <Box
        as="aside"
        w="264px"
        maxW="85vw"
        h="100vh"
        flexShrink="0"
        position={{ base: "fixed", lg: "relative" }}
        top="0"
        left="0"
        transform={{ base: menuOpen ? "translateX(0)" : "translateX(-100%)", lg: "none" }}
        transition="transform 0.25s ease"
        display="flex"
        flexDirection="column"
        bg="#0e2a27"
        color="white"
        px="20px"
        py="24px"
        // Only the menu scrolls (below); the hospital name and the profile / sign-out card stay in view.
        overflow="hidden"
        zIndex={{ base: "60", lg: "50" }}
        borderRight="1px solid rgba(255,255,255,0.06)"
        boxShadow="4px 0 24px rgba(0,0,0,0.22)"
        css={{ scrollbarColor: "#2a5550 transparent", scrollbarWidth: "thin" }}
      >
        <Button
          display={{ base: "flex", lg: "none" }}
          position="absolute"
          top="14px"
          right="12px"
          variant="ghost"
          color="rgba(194,216,212,0.8)"
          _hover={{ bg: "rgba(255,255,255,0.07)", color: "white" }}
          p="2"
          minW="auto"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        >
          <FontAwesomeIcon icon={faXmark} />
        </Button>
        <HStack gap="3" mb="6" px="2" pr={{ base: "8", lg: "2" }}>
          {hospitalSettings?.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hospitalSettings.logoDataUrl}
              alt="Hospital logo"
              style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, objectFit: "contain", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
            />
          ) : (
            <Flex
              w="38px" h="38px" flexShrink="0"
              bgGradient="to-br" gradientFrom="#4ade80" gradientTo="#2dd4bf"
              color="#0a2520" align="center" justify="center" borderRadius="10px"
              boxShadow="0 2px 12px rgba(74,222,128,0.35)"
            >
              <FontAwesomeIcon icon={faHospital} size="lg" />
            </Flex>
          )}
          <Box minW="0">
            <Text fontSize="sm" fontWeight="800" whiteSpace="normal" lineHeight="1.2" color="#f0faf8" letterSpacing="-0.02em">
              {hospitalSettings?.name || "Al Qamar Hospital"}
            </Text>
            <Text fontSize="10px" color="#6fa79c" letterSpacing="0.1em" textTransform="uppercase" mt="0.5" fontWeight="600">
              {user?.role ? roleWorkspace[user.role] : "Management suite"}
            </Text>
          </Box>
        </HStack>
        <Box as="nav" aria-label="Main menu" pb="4" flex="1" minH="0" overflowY="auto" overscrollBehavior="contain" mx="-2" px="2" css={{ scrollbarColor: "#2a5550 transparent", scrollbarWidth: "thin" }}>
          {navGroups.map((group) => (
            <Box key={group.title} mb="3">
              {/* A one-group menu (Lab) needs no section title. */}
              {navGroups.length > 1 && (
                <Text px="3" mb="1" fontSize="10px" fontWeight="700" letterSpacing="0.12em" textTransform="uppercase" color="rgba(170,205,198,0.45)">
                  {group.title}
                </Text>
              )}
              <Stack gap="0.5">
                {group.items.map((item) => {
                  const isActive = item.href === activeHref;
                  return (
                    <Button
                      key={item.label}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => { setMenuOpen(false); router.push(item.href); }}
                      justifyContent="flex-start"
                      gap="3"
                      h="38px"
                      px="3"
                      bg={isActive ? "rgba(95,212,191,0.14)" : "transparent"}
                      color={isActive ? "#ffffff" : "rgba(204,224,220,0.78)"}
                      fontWeight={isActive ? "600" : "500"}
                      fontSize="sm"
                      borderRadius="9px"
                      boxShadow="none"
                      _hover={{ bg: isActive ? "rgba(95,212,191,0.18)" : "rgba(255,255,255,0.06)", color: "#ffffff" }}
                      position="relative"
                      overflow="hidden"
                    >
                      {isActive && <Box position="absolute" left="0" top="8px" bottom="8px" w="3px" bg="#5fd4bf" borderRadius="0 3px 3px 0" />}
                      <Box w="18px" textAlign="center" color={isActive ? "#5fd4bf" : "inherit"} opacity={isActive ? 1 : 0.75}>
                        <FontAwesomeIcon icon={item.icon} />
                      </Box>
                      <Text as="span" lineClamp={1} textAlign="left">
                        {item.label}
                      </Text>
                    </Button>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Box>

        <Box mt="auto" pt="14px" flexShrink="0" borderTop="1px solid rgba(255,255,255,0.06)">
          <HStack
            px="10px" gap="3" bg="rgba(255,255,255,0.05)" p="10px" borderRadius="12px"
            border="1px solid rgba(255,255,255,0.08)"
            backdropFilter="blur(8px)"
          >
            <HStack flex="1" minW="0" gap="3" cursor="pointer" onClick={() => { setMenuOpen(false); router.push("/profile"); }} title="View profile">
              <Flex
                w="34px" h="34px" flexShrink="0" borderRadius="full"
                bgGradient="to-br" gradientFrom="#2dd4bf" gradientTo="#4ade80"
                color="#0a2520" align="center" justify="center" fontWeight="800" fontSize="xs"
                boxShadow="0 0 0 2px rgba(45,212,191,0.3), 0 2px 8px rgba(0,0,0,0.3)"
              >
                {user?.username ? user.username.slice(0, 2).toUpperCase() : "..."}
              </Flex>
              <Box flex="1" minW="0">
                <Text fontSize="sm" fontWeight="600" color="#e8faf6" overflow="hidden" textOverflow="ellipsis">{user?.name || user?.username || "Loading..."}</Text>
                <Text fontSize="xs" color="#4a7a72">{user?.role ? roleLabels[user.role] : "..."}</Text>
              </Box>
            </HStack>
            <Button
              aria-label="Sign out" title="Sign out" variant="ghost"
              color="#4a7a72" _hover={{ color: "#f87171", bg: "rgba(220,38,38,0.12)" }}
              p="2" minW="auto" loading={loggingOut} onClick={logout}
            >
              <FontAwesomeIcon icon={faRightFromBracket} />
            </Button>
          </HStack>
        </Box>
      </Box>

      <Flex flex="1" minW="0" h="100vh" direction="column">
        <Flex
          className="app-topbar"
          display={{ base: "flex", lg: "none" }}
          h="56px"
          flexShrink="0"
          align="center"
          gap="3"
          px="12px"
          bg="#0e2a27"
          color="white"
          boxShadow="0 2px 12px rgba(0,0,0,0.18)"
          zIndex="45"
        >
          <Button
            variant="ghost"
            color="white"
            _hover={{ bg: "rgba(255,255,255,0.08)" }}
            p="2"
            minW="auto"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <FontAwesomeIcon icon={faBars} size="lg" />
          </Button>
          <Box minW="0" lineHeight="1.2">
            <Text fontSize="sm" fontWeight="800" color="#f0faf8" lineClamp={1}>
              {hospitalSettings?.name || "Al Qamar Hospital"}
            </Text>
            {/* Which page this is, since the sidebar is hidden on small screens. */}
            {activeItem && (
              <Text fontSize="11px" color="#8fc4b9" lineClamp={1}>
                {activeItem.label}
              </Text>
            )}
          </Box>
        </Flex>
        {/* Only the page area scrolls — the sidebar and small-screen top bar stay put. */}
        <Box flex="1" minW="0" overflowY="auto" bg="#eef2f0">
          {children}
        </Box>
      </Flex>
      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        theme="light"
        style={{ zIndex: 9999 }}
      />
    </Flex>
  );
}
