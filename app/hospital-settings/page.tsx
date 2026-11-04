"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Box, Button, Field, Flex, Grid, Heading, HStack, Input, Link, Text, Textarea, VStack } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBuilding, faCloudArrowUp, faFloppyDisk, faHospital, faTrash } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

type Settings = {
  name: string;
  nameUrdu: string;
  address: string;
  addressUrdu: string;
  phone: string;
  email: string;
  logoDataUrl: string | null;
};

const emptySettings: Settings = {
  name: "",
  nameUrdu: "",
  address: "",
  addressUrdu: "",
  phone: "",
  email: "",
  logoDataUrl: null,
};

export default function HospitalSettingsPage() {
  const [form, setForm] = useState<Settings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/hospital-settings");
      const data = await response.json();
      if (response.ok) {
        setForm({
          name: data.settings.name ?? "",
          nameUrdu: data.settings.nameUrdu ?? "",
          address: data.settings.address ?? "",
          addressUrdu: data.settings.addressUrdu ?? "",
          phone: data.settings.phone ?? "",
          email: data.settings.email ?? "",
          logoDataUrl: data.settings.logoDataUrl ?? null,
        });
      } else {
        toast.error(data.error ?? "Unable to load hospital settings.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function handleLogoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error("Logo image must be smaller than 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/hospital-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Unable to save hospital settings.");
        return;
      }
      toast.success("Hospital details updated. Doctor slips will use the new details immediately.");
      await load();
    } catch {
      toast.error("Unable to reach the clinic server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box minH="100vh" bg="#eef2f0" color="#0e2420">
      <Flex as="header" className="page-header" position="sticky" top="0" zIndex="40" minH={{ base: "60px", md: "72px" }} py="3" gap="3" flexWrap="wrap" align="center" justify="space-between" px={{ base: "16px", md: "24px", xl: "32px" }} bg="rgba(255,255,255,0.92)" borderBottom="1px solid rgba(14,36,32,0.08)" boxShadow="0 1px 2px rgba(14,36,32,0.04)" style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <HStack gap="4">
          <Link href="/" color="#2da08b" _hover={{ color: "#1a8070" }} transition="color 0.15s ease">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Link>
          <Box>
            <Heading size={{ base: "md", md: "lg" }} letterSpacing="-0.04em" color="#0e2420">
              Hospital Settings
            </Heading>
          </Box>
        </HStack>
      </Flex>

      <Box as="main" px={{ base: "16px", md: "24px", xl: "32px" }} py={{ base: "20px", md: "28px" }} w="100%" maxW="1680px" mx="auto">
        {loading ? (
          <Text color="#77908b" py="8" textAlign="center">
            Loading hospital settings…
          </Text>
        ) : (
          <form onSubmit={submit}>
            <VStack align="stretch" gap="6">
              {/* Logo */}
              <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" p={{ base: "20px", md: "28px" }} boxShadow="0 1px 2px rgba(14,36,32,0.04), 0 2px 12px rgba(14,36,32,0.035)">
                <HStack mb="4">
                  <Flex w="36px" h="36px" bg="#e9f1ef" color="#126b68" borderRadius="9px" align="center" justify="center">
                    <FontAwesomeIcon icon={faHospital} />
                  </Flex>
                  <Heading size="sm">Hospital Logo</Heading>
                </HStack>
                <HStack gap="5" align="center">
                  <Flex
                    w="90px"
                    h="90px"
                    borderRadius="12px"
                    border="1px dashed #c8dad5"
                    bg="#f8faf9"
                    align="center"
                    justify="center"
                    overflow="hidden"
                    flexShrink="0"
                  >
                    {form.logoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.logoDataUrl} alt="Hospital logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    ) : (
                      <FontAwesomeIcon icon={faBuilding} size="2x" color="#a8c1bb" />
                    )}
                  </Flex>
                  <VStack align="start" gap="2">
                    <HStack gap="2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        borderColor="#c8dad5"
                        color="#126b68"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <FontAwesomeIcon icon={faCloudArrowUp} />
                        &nbsp; Upload logo
                      </Button>
                      {form.logoDataUrl && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          borderColor="#fecaca"
                          color="#dc2626"
                          onClick={() => setForm((prev) => ({ ...prev, logoDataUrl: null }))}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          &nbsp; Remove
                        </Button>
                      )}
                    </HStack>
                    <Text fontSize="xs" color="#77908b">
                      PNG, JPG, WEBP, or SVG — up to 1.5&nbsp;MB. Shown at the center of the doctor slip header.
                    </Text>
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={handleLogoSelect} />
                  </VStack>
                </HStack>
              </Box>

              {/* Hospital identity */}
              <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" p={{ base: "20px", md: "28px" }} boxShadow="0 1px 2px rgba(14,36,32,0.04), 0 2px 12px rgba(14,36,32,0.035)">
                <Heading size="sm" mb="5">
                  Hospital Identity
                </Heading>
                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="5">
                  <Field.Root required>
                    <Field.Label fontWeight="700">Hospital Name (English)</Field.Label>
                    <Input
                      placeholder="e.g. Al Qamar Hospital"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Hospital Name (Urdu)</Field.Label>
                    <Input
                      dir="rtl"
                      fontFamily="var(--font-urdu)"
                      placeholder="مثلاً کیئر لیجر کلینک"
                      value={form.nameUrdu}
                      onChange={(event) => setForm({ ...form, nameUrdu: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Address (English)</Field.Label>
                    <Textarea
                      placeholder="Full clinic address"
                      value={form.address}
                      onChange={(event) => setForm({ ...form, address: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Address (Urdu)</Field.Label>
                    <Textarea
                      dir="rtl"
                      fontFamily="var(--font-urdu)"
                      placeholder="مکمل پتہ"
                      value={form.addressUrdu}
                      onChange={(event) => setForm({ ...form, addressUrdu: event.target.value })}
                    />
                  </Field.Root>
                </Grid>
              </Box>

              {/* Contact info */}
              <Box bg="white" border="1px solid #e1e9e6" borderRadius="14px" p={{ base: "20px", md: "28px" }} boxShadow="0 1px 2px rgba(14,36,32,0.04), 0 2px 12px rgba(14,36,32,0.035)">
                <Heading size="sm" mb="5">
                  Contact Information
                </Heading>
                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="5">
                  <Field.Root>
                    <Field.Label fontWeight="700">Phone Number(s)</Field.Label>
                    <Input
                      placeholder="e.g. 051-1234567, 0300-1234567"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label fontWeight="700">Email</Field.Label>
                    <Input
                      type="email"
                      placeholder="e.g. info@careledgerclinic.com"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                    />
                  </Field.Root>
                </Grid>
              </Box>

              <Flex justify="flex-end">
                <Button
                  type="submit"
                  loading={saving}
                  bg="#11695e"
                  color="white"
                  h="46px"
                  px="28px"
                  fontWeight="700"
                  _hover={{ bg: "#0d5850" }}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} />
                  &nbsp; Save Hospital Details
                </Button>
              </Flex>
            </VStack>
          </form>
        )}
      </Box>
    </Box>
  );
}
