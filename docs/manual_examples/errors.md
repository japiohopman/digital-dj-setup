PS C:\Users\Gebruiker\Documents\GitHub\digital-dj-setup> npm run dev

> digital-dj-setup@0.1.0 dev
> vite


  VITE v8.3.6  ready in 1354 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
13:39:51 [vite] Internal server error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
      at TransformPluginContext._formatLog (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8861:39)
      at TransformPluginContext.error (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8858:14)
      at resolveId (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26533:18)
      at async file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26632:23
      at async Promise.all (index 1)
      at async TransformPluginContext.transform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26605:4)
      at async EnvironmentPluginContainer.transform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8632:14)
      at async loadAndTransform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:20108:26)
13:39:51 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:39:51 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:39:51 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:39:51 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm"; (x2)
13:39:51 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:14 [vite] (client) page reload src/audio/useVinylMotion.ts
13:45:14 [vite] (client) page reload src/audio/useTonearm.ts
13:45:14 [vite] (client) hmr update /src/App.tsx
13:45:14 [vite] (client) page reload src/state/deckMachine.ts
13:45:14 [vite] (client) page reload src/components/Turntable.test.tsx
13:45:14 [vite] (client) page reload src/state/deckStore.ts
13:45:14 [vite] (client) page reload src/state/deckMachine.ts
13:45:14 [vite] (client) page reload src/state/deckMachine.ts (x2)
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm"; (x2)
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:15 [vite] Internal server error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
      at TransformPluginContext._formatLog (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8861:39)
      at TransformPluginContext.error (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8858:14)
      at resolveId (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26533:18)
      at async file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26632:23
      at async Promise.all (index 1)
      at async TransformPluginContext.transform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26605:4)
      at async EnvironmentPluginContainer.transform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8632:14)
      at async loadAndTransform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:20108:26)
      at async viteTransformMiddleware (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:20328:20)
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm"; (x2)
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450; (x2)
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm"; (x2)
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450; (x2)
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:15 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm"; (x2)
13:45:16 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:24 [vite] Internal server error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
      at TransformPluginContext._formatLog (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8861:39)
      at TransformPluginContext.error (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8858:14)
      at resolveId (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26533:18)
      at async file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26632:23
      at async Promise.all (index 1)
      at async TransformPluginContext.transform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26605:4)
      at async EnvironmentPluginContainer.transform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8632:14)
      at async loadAndTransform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:20108:26)
      at async viteTransformMiddleware (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:20328:20)
13:45:24 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:24 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:24 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm"; (x2)
13:45:24 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:27 [vite] Internal server error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
      at TransformPluginContext._formatLog (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8861:39)
      at TransformPluginContext.error (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8858:14)
      at resolveId (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26533:18)
      at async file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26632:23
      at async Promise.all (index 1)
      at async TransformPluginContext.transform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:26605:4)
      at async EnvironmentPluginContainer.transform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:8632:14)
      at async loadAndTransform (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:20108:26)
      at async viteTransformMiddleware (file:///C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/node_modules/vite/dist/node/chunks/node.js:20328:20)
13:45:27 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:27 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:27 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;
13:45:27 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm";
13:45:27 [vite] (client) Pre-transform error: Failed to resolve import "zustand" from "src/components/Turntable.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/components/Turntable.tsx:2:25
  1  |  import { useState, useRef, useEffect } from "react";
  2  |  import { useStore } from "zustand";
     |                            ^
  3  |  import { useVinylMotion } from "../audio/useVinylMotion";
  4  |  import { useTonearm } from "../audio/useTonearm"; (x2)
13:45:27 [vite] (client) Pre-transform error: Failed to resolve import "zustand/vanilla" from "src/state/deckStore.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/Users/Gebruiker/Documents/GitHub/digital-dj-setup/src/state/deckStore.ts:1:43
  1  |  import { createStore } from "zustand/vanilla";
     |                               ^
  2  |  import { canPlayTrack, createInitialDeckState, selectIsTrackAudible, selectRecordSoundState, transitionDeck } from "....
  3  |  const SPIN_UP_MS = 450;