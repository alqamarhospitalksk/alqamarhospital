"use client";

import { useState, type ReactNode } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";

// Chakra's styles come from Emotion. Left alone, Emotion writes a <style> tag between nearly every
// element of the server HTML, which the browser's first render doesn't have — so React sometimes
// throws "Hydration failed (#418)" and rebuilds the whole page. This is the standard fix for Next's
// App Router: collect the CSS while the server renders and place it once in <head> instead.
export function EmotionRegistry({ children }: { children: ReactNode }) {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: "css" });
    cache.compat = true;
    const originalInsert = cache.insert;
    let inserted: string[] = [];
    cache.insert = (...args: Parameters<typeof originalInsert>) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) inserted.push(serialized.name);
      return originalInsert(...args);
    };
    const flush = () => {
      const names = inserted;
      inserted = [];
      return names;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;
    let styles = "";
    for (const name of names) styles += cache.inserted[name];
    return <style key={cache.key} data-emotion={`${cache.key} ${names.join(" ")}`} dangerouslySetInnerHTML={{ __html: styles }} />;
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
