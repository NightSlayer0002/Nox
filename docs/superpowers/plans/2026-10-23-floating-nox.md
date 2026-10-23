# Floating NOX Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for integration and focused parallel agents for independent movement and message-action modules. Steps use checkbox syntax for tracking.

**Goal:** Make conversation NOX manually placeable across the chat, with optional composer gravity, a keyboard reaction and a smaller trailing controls bot.

**Architecture:** Keep the existing Stage in a small fixed DOM surface while the conversation route is active. A pure CSS-pixel movement model owns its position; an adapter supplies pointer events, viewport/floor measurements and existing expression hooks. Independent message-action and follower helpers connect through narrow interfaces.

**Tech Stack:** Existing JavaScript, CSS, Stage canvas and SVG bot; Node tests and real browser checks. No dependencies.

**Spec:** ../specs/2026-10-23-floating-nox-design.md

## Global Constraints

- No autonomous wandering, lateral fling, or relocation on typing.
- Gravity pulls vertically onto the composer; keyboard hop is 8 CSS pixels and occurs only at an open/close transition when perched, not while dragging.
- Bot artwork is at most 28px on mobile and visibly smaller than the approximately 76px character; tap target may be 44px.
- Preserve shared voice, calls, exports, Scene studio, Afterimage and reduced-motion behavior.
- Keep private docs/research untracked. Make separate focused commits and verify before publishing.

## Review Focus

- Pointer cancellation and touch scrolling must not leave a stuck drag or trigger a message action.
- Keyboard suggestion-height changes must not repeat hops or move a manually placed character when gravity is off.
- View switches and the call's reparented canvas must restore original sizing and last floating placement.
- Menus near screen edges must remain readable, stationary and accessible by keyboard.
- Falling through or parking over messages must never send a prompt without an explicit action.

## Tasks

### 1. Movement model

Files: public/js/floating-dynamics.js, tests/floating-dynamics.test.mjs.
Interface: createFloatingDynamics({x,y,size,gravity=false}) returns state, setBounds({left,top,right,bottom,floor}), setGravity(bool), grab({x,y}), drag({x,y}), release({cancel=false}), place({x,y}), keyboard(open,{reduceMotion=false}), step(dt). State exposes x,y,size,vy,dragging,grounded,hopCount,impact. x/y are top-left CSS pixels; floor is composer top, bounded by the viewport bottom. No x velocity.

- [ ] Test and implement stationary placement, vertical fall, bounded viewport, single keyboard transition hop, cancellation and reduced motion.
- [ ] Run node --test tests/floating-dynamics.test.mjs.

### 2. Deliberate message actions

Files: public/js/message-companion.js, tests/message-companion.test.mjs. Root wires callbacks in app.js.
Interface: attachMessageCompanion({documentTarget,conversation,onAction,dwellMs=650}) returns inspect({x,y,dragging}), release({cancel=false}), clear(), dispose(). onAction receives {kind:'explain'|'read'|'quiz',message,text}. A stationary 650ms drag hold over a completed message opens a fixed, viewport-clamped menu; release retains an opened menu, cancellation closes it. Passive gravity never calls inspect with dragging=true.

- [ ] Test message selection, dwell cancellation, no automatic action, explicit callbacks and stale message removal.
- [ ] Implement with existing icon assets; return clear CSS hooks for root styling.

### 3. Floating surface and controls

Files: public/js/floating-presence.js, public/floating-presence.css, public/js/app.js, public/js/stage.js, public/app.html, adapter tests.

- [ ] Add Stage.externalPlacement flag to skip internal scene-position animation while the DOM adapter owns placement.
- [ ] Integrate fixed-size, transparent Stage with a silhouette-sized pointer handle, existing poke/drag/hold/keyboard expressions, and a smaller following SVG bot with a bounded fading trail.
- [ ] Measure composer and visual viewport with ResizeObserver; classify keyboard transitions; no textbox-input relocation.
- [ ] Suspend in call/film/recording/other routes and restore existing surfaces and placement.
- [ ] Connect Park/Hide/Show and message callbacks to existing composer/voice behavior. Provide equivalent keyboard message actions.
- [ ] Remove the reserved conversation row and side column only while the floating surface is active.

### 4. Verification and release

- [ ] Exercise long chat scrolling, manual placement, gravity, open/close keyboard, touch cancellation, small bot, menu edges, message actions and shared call stage at phone/tablet/desktop sizes.
- [ ] Run npm run verify and design detector, review final changes, and fix material findings.
- [ ] Commit separately by behavior and publish; verify exact deployment and capture live proof.
