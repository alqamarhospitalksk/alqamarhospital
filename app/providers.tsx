"use client";

import { ChakraProvider, createSystem, defaultConfig } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { EmotionRegistry } from "./emotion-registry";

// Matches the login page's username/password fields, so every input/textarea/select in the
// app shares one look: soft fill, rounded, green border + glow on focus.
const fieldLook = {
  bg: "#fafcfb",
  borderWidth: "1px",
  borderColor: "#d9e4e0",
  borderRadius: "10px",
  focusVisibleRing: "none",
  transition: "border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
  _hover: { borderColor: "#c3d4ce" },
  _focus: {
    bg: "white",
    borderColor: "#1f9482",
    boxShadow: "0 0 0 3px rgba(31,148,130,0.14)",
    outline: "none",
  },
  _disabled: { bg: "#f2f5f4", color: "#7d938d", cursor: "not-allowed" },
};

// The hospital's teal, light to dark. Primary buttons use 700 (#11695e) with 800 on hover.
const brand = {
  50: "#effaf7",
  100: "#d6f1ea",
  200: "#aee2d5",
  300: "#79cbb9",
  400: "#43ad98",
  500: "#1f9482",
  600: "#167b6d",
  700: "#11695e",
  800: "#0d5850",
  900: "#0e3f3a",
  950: "#0b2a27",
};

const system = createSystem(defaultConfig, {
  globalCss: {
    "html, body": { bg: "#eef2f0", color: "#0e2420" },
    // Headings across the app share one tight, confident letter spacing.
    "h1, h2, h3": { letterSpacing: "-0.02em" },
  },
  theme: {
    tokens: {
      fonts: {
        body: { value: "var(--font-geist-sans)" },
        heading: { value: "var(--font-geist-sans)" },
      },
      colors: {
        brand: Object.fromEntries(Object.entries(brand).map(([step, value]) => [step, { value }])),
      },
    },
    semanticTokens: {
      colors: {
        // Lets components use colorPalette="brand" like any built-in palette.
        brand: {
          solid: { value: "{colors.brand.700}" },
          contrast: { value: "white" },
          fg: { value: "{colors.brand.700}" },
          muted: { value: "{colors.brand.100}" },
          subtle: { value: "{colors.brand.50}" },
          emphasized: { value: "{colors.brand.200}" },
          focusRing: { value: "{colors.brand.500}" },
        },
      },
    },
    recipes: {
      button: {
        base: {
          borderRadius: "10px",
          fontWeight: "600",
          letterSpacing: "-0.005em",
          transition: "background 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease, border-color 0.15s ease, color 0.15s ease",
          _active: { transform: "translateY(1px)" },
          _disabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },
          focusVisibleRing: "outside",
          focusRingColor: "brand.500",
        },
        variants: {
          variant: {
            solid: { boxShadow: "0 1px 2px rgba(14,36,32,0.14), inset 0 1px 0 rgba(255,255,255,0.08)" },
            outline: { bg: "white", _hover: { bg: "#f3f8f6" } },
          },
          size: {
            xs: { borderRadius: "8px" },
            sm: { borderRadius: "9px" },
          },
        },
      },
      badge: {
        base: { borderRadius: "full", fontWeight: "600", letterSpacing: "0.01em", px: "2" },
      },
      heading: {
        base: { color: "#0e2420" },
      },
      input: {
        variants: {
          size: {
            md: { px: "3.5", "--input-height": "sizes.12" },
          },
          variant: {
            outline: fieldLook,
            // Every flushed input in the app sits inside its own bordered wrapper (search bars,
            // date ranges, login fields), so its own underline/focus shadow draws a second box.
            flushed: {
              borderBottomWidth: "0",
              _focusVisible: { borderColor: "transparent", boxShadow: "none" },
            },
          },
        },
      },
      textarea: {
        variants: {
          size: {
            md: { px: "3.5", py: "3" },
          },
          variant: {
            outline: fieldLook,
          },
        },
      },
    },
    slotRecipes: {
      nativeSelect: {
        slots: ["root", "field", "indicator"],
        variants: {
          size: {
            md: { root: { "--select-field-height": "sizes.12" }, field: { ps: "3.5" } },
          },
          variant: {
            outline: { field: fieldLook },
          },
        },
      },
      // One table look everywhere: quiet uppercase column titles, hairline rows, a soft hover.
      // On phones every cell stays on one line and the table scrolls sideways inside its card,
      // instead of breaking words like "MR-1016" over two lines.
      table: {
        slots: ["root", "header", "body", "row", "columnHeader", "cell", "footer", "caption"],
        base: {
          root: { fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0 },
          columnHeader: {
            bg: "#f6f9f8",
            color: "#5b7a73",
            fontSize: "11px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            whiteSpace: "nowrap",
            borderBottom: "1px solid #e3ebe8",
            py: "2.5",
          },
          row: { transition: "background 0.12s ease", _hover: { bg: "#f6fbf9" } },
          cell: {
            borderBottom: "1px solid #edf2f0",
            whiteSpace: { base: "nowrap", md: "normal" },
            verticalAlign: "middle",
          },
        },
      },
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <EmotionRegistry>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </EmotionRegistry>
  );
}
