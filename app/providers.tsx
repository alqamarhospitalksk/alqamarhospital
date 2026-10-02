"use client";

import { ChakraProvider, createSystem, defaultConfig } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { EmotionRegistry } from "./emotion-registry";

// Matches the login page's username/password fields, so every input/textarea/select in the
// app shares one look: soft fill, rounded, green border + glow on focus.
const fieldLook = {
  bg: "#fafafa",
  borderWidth: "1px",
  borderColor: "#dbe5e1",
  borderRadius: "10px",
  focusVisibleRing: "none",
  transition: "border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
  _focus: {
    bg: "white",
    borderColor: "#2da08b",
    boxShadow: "0 0 0 3px rgba(45,160,139,0.12)",
    outline: "none",
  },
};

const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        body: { value: "var(--font-geist-sans)" },
        heading: { value: "var(--font-geist-sans)" },
      },
    },
    recipes: {
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
