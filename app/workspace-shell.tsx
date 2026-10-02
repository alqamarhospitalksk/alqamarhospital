"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, Button, Flex, HStack, Link, Stack, Text } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faBed, faBoxesStacked, faBuilding, faCartShopping, faCashRegister, faChartLine, faClipboardCheck, faClockRotateLeft, faCoins, faFileInvoiceDollar, faFlask, faGaugeHigh, faHandHoldingDollar, faHospital, faHourglassHalf, faKitMedical, faVault, faNotesMedical, faPeopleGroup, faPrescriptionBottleMedical, faRightFromBracket, faRotateLeft, faShieldHalved, faTriangleExclamation, faTruckMedical, faUserDoctor, faUserTie, faVial, faXmark } from "@fortawesome/free-solid-svg-icons";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type Role = "OPERATOR" | "MANAGEMENT" | "LAB" | "MEDICAL_STORE";

const navigation: { label: string; icon: typeof faGaugeHigh; href: string; roles: Role[] }[] = [
  { label: "Dashboard", icon: faGaugeHigh, href: "/", roles: ["MANAGEMENT"] },
  { label: "Patients", icon: faPeopleGroup, href: "/patients", roles: ["OPERATOR"] },
  { label: "OPD desk", icon: faNotesMedical, href: "/opd", roles: ["OPERATOR"] },
  { label: "Doctors", icon: faUserDoctor, href: "/doctors", roles: ["MANAGEMENT"] },
  { label: "Tests", icon: faFlask, href: "/diagnostics", roles: ["OPERATOR"] },
  { label: "Lab results", icon: faVial, href: "/results", roles: ["OPERATOR"] },
  { label: "Operation theater", icon: faBed, href: "/ot", roles: ["OPERATOR"] },
  { label: "Minor emergency", icon: faKitMedical, href: "/emergency", roles: ["OPERATOR"] },
  { label: "Billing & reports", icon: faFileInvoiceDollar, href: "/reports", roles: ["MANAGEMENT"] },
  { label: "Payouts", icon: faFileInvoiceDollar, href: "/payouts", roles: ["MANAGEMENT"] },
  { label: "Employees", icon: faUserTie, href: "/employees", roles: ["MANAGEMENT"] },
  { label: "Expenses", icon: faCoins, href: "/expenses", roles: ["MANAGEMENT"] },
  { label: "Hospital settings", icon: faBuilding, href: "/hospital-settings", roles: ["MANAGEMENT"] },
  { label: "Inventory", icon: faBed, href: "/inventory", roles: ["MANAGEMENT"] },
  { label: "Rooms & beds", icon: faBed, href: "/rooms", roles: ["MANAGEMENT"] },
  { label: "User access", icon: faShieldHalved, href: "/users", roles: ["MANAGEMENT"] },
  { label: "Lab dashboard", icon: faGaugeHigh, href: "/lab", roles: ["LAB"] },
  { label: "Upload tests", icon: faVial, href: "/lab/upload", roles: ["LAB"] },
  { label: "Test & Price Catalog", icon: faFlask, href: "/configuration", roles: ["LAB"] },
  { label: "Store dashboard", icon: faGaugeHigh, href: "/medical-store", roles: ["MEDICAL_STORE"] },
  { label: "Medicine catalog", icon: faPrescriptionBottleMedical, href: "/medical-store/catalog", roles: ["MEDICAL_STORE"] },
  { label: "Suppliers", icon: faTruckMedical, href: "/medical-store/suppliers", roles: ["MEDICAL_STORE"] },
  { label: "Supplier payments", icon: faHandHoldingDollar, href: "/medical-store/supplier-payments", roles: ["MEDICAL_STORE"] },
  { label: "Purchase (stock in)", icon: faBoxesStacked, href: "/medical-store/purchase", roles: ["MEDICAL_STORE"] },
  { label: "Reorder list", icon: faCartShopping, href: "/medical-store/reorder", roles: ["MEDICAL_STORE"] },
  { label: "Sell medicine", icon: faCashRegister, href: "/medical-store/sell", roles: ["MEDICAL_STORE"] },
  { label: "Day closing", icon: faVault, href: "/medical-store/day-closing", roles: ["MEDICAL_STORE"] },
  { label: "Stock adjustments", icon: faTriangleExclamation, href: "/medical-store/adjustments", roles: ["MEDICAL_STORE"] },
  { label: "Stock count", icon: faClipboardCheck, href: "/medical-store/stock-count", roles: ["MEDICAL_STORE"] },
  { label: "Stock history", icon: faClockRotateLeft, href: "/medical-store/stock-history", roles: ["MEDICAL_STORE"] },
  { label: "Expiry tracker", icon: faHourglassHalf, href: "/medical-store/expiry", roles: ["MEDICAL_STORE"] },
  { label: "Sale returns", icon: faRotateLeft, href: "/medical-store/returns/sale", roles: ["MEDICAL_STORE"] },
  { label: "Purchase returns", icon: faRotateLeft, href: "/medical-store/returns/purchase", roles: ["MEDICAL_STORE"] },
  { label: "Reports", icon: faChartLine, href: "/medical-store/reports", roles: ["MEDICAL_STORE"] },
];

const roleLabels: Record<Role, string> = { OPERATOR: "Operator", MANAGEMENT: "Management", LAB: "Lab", MEDICAL_STORE: "Medical Store" };

type User = { id?: number; username: string; name?: string | null; role: Role; mustChangePassword?: boolean };
type HospitalSettings = { name: string; logoDataUrl?: string | null };

const RESULT_POLL_INTERVAL_MS = 5000;

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

  useEffect(() => {
    if (user?.role !== "OPERATOR") return;

    let cancelled = false;
    notifiedResultIdsRef.current = new Set();
    baselineEstablishedRef.current = false;

    async function poll() {
      try {
        const res = await fetch("/api/diagnostics/recent-results");
        if (cancelled) return;
        if (res.status === 401) {
          // Session expired or was revoked (e.g. a password reset) while this tab sat idle
          // on the same page — the pathname-keyed auth-check effect won't notice until the
          // next navigation, so clear it here too instead of spamming 401s every 5s.
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

    void poll();
    const interval = setInterval(() => void poll(), RESULT_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.role]);

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
        overflowY="auto"
        overscrollBehavior="contain"
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
              {hospitalSettings?.name || "CareLedger"}
            </Text>
            <Text fontSize="9px" color="#4a7a72" letterSpacing="0.08em" textTransform="uppercase" mt="0.5">
              Management Suite
            </Text>
          </Box>
        </HStack>
        <Stack gap="1" pb="4">
          {visibleNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Button
                key={item.label}
                onClick={() => { setMenuOpen(false); router.push(item.href); }}
                justifyContent="flex-start"
                gap="3"
                h="40px"
                px="14px"
                bg={isActive ? "linear-gradient(135deg, rgba(45,160,139,0.30) 0%, rgba(30,100,90,0.20) 100%)" : "transparent"}
                color={isActive ? "#e8faf6" : "rgba(194,216,212,0.8)"}
                fontWeight={isActive ? "700" : "400"}
                fontSize="sm"
                borderRadius="10px"
                border="1px solid"
                borderColor={isActive ? "rgba(74,222,128,0.22)" : "transparent"}
                boxShadow={isActive ? "0 2px 12px rgba(30,120,105,0.22)" : "none"}
                _hover={{ bg: "rgba(255,255,255,0.07)", color: "#e8faf6", borderColor: "rgba(255,255,255,0.08)" }}
                transition="all 0.15s ease"
                position="relative"
                overflow="hidden"
              >
                {isActive && (
                  <Box
                    position="absolute"
                    left="0"
                    top="50%"
                    transform="translateY(-50%)"
                    w="3px"
                    h="55%"
                    bgGradient="to-b"
                    gradientFrom="#4ade80"
                    gradientTo="#2dd4bf"
                    borderRadius="0 3px 3px 0"
                    boxShadow="0 0 8px rgba(74,222,128,0.5)"
                  />
                )}
                <Box w="18px" textAlign="center" opacity={isActive ? 1 : 0.7}>
                  <FontAwesomeIcon icon={item.icon} />
                </Box>
                {item.label}
              </Button>
            );
          })}
        </Stack>

        <Box mt="auto" pt="14px" borderTop="1px solid rgba(255,255,255,0.06)">
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
          <Text fontSize="sm" fontWeight="800" color="#f0faf8" lineClamp={1}>
            {hospitalSettings?.name || "CareLedger"}
          </Text>
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
