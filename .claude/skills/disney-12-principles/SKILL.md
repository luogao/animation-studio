---
name: disney-12-principles
description: Disney's 12 Principles of Animation — squash & stretch, anticipation, staging, straight ahead / pose-to-pose, follow through, slow in/out, arcs, secondary action, timing, exaggeration, solid drawing, appeal. Use when designing character animation, motion graphics, or any animated scene to ensure natural, expressive movement. Apply alongside GSAP technical skills (gsap-core, gsap-timeline) to translate principles into code.
---

# Disney's 12 Principles of Animation

## When to Use This Skill

Apply these principles when designing **any** animation — character movement, UI transitions, scene choreography, text reveals, particle effects. They are the foundation of believable motion. When the user describes a scene concept or asks for "natural," "expressive," "lively," or "Disney-style" animation, reference these principles.

**Related skills:** Use **gsap-core** for tween implementation, **gsap-timeline** for sequencing, **gsap-easing** for slow in/out curves.

---

## 1. Squash & Stretch

**What:** Objects deform when they move — squashing on impact, stretching during motion. Preserves volume (stretch in one axis = squash in the other).

**When to apply:**
- Bouncing ball, falling objects, impacts
- Character jumps, landings, punches
- UI elements scaling on press/hover
- Text or emoji "pop-in" effects

**GSAP implementation:**
```js
// Bouncing ball: stretch on the way down, squash on impact
gsap.to(ball, {
  scaleX: 0.7, scaleY: 1.3, // squash
  duration: 0.1, ease: "power2.in",
});
gsap.to(ball, {
  scaleX: 1.3, scaleY: 0.7, // stretch (rising)
  duration: 0.15, ease: "power2.out",
});
```

**Key rule:** Maintain apparent volume — `scaleX * scaleY ≈ 1.0` at extremes. Don't overdo it; subtle squash/stretch (0.8–1.2 range) works for most UI, 0.5–1.5 for cartoony characters.

---

## 2. Anticipation

**What:** A small movement in the opposite direction before the main action. Signals the audience something is about to happen.

**When to apply:**
- Character about to jump (crouch first)
- Element about to slide in (tiny back-sway first)
- Ball about to launch (pull back first)
- Punch or throw (wind-up first)

**GSAP implementation:**
```js
// Jump: crouch (anticipation) → launch → land
const tl = gsap.timeline();
tl.to(char, { scaleY: 0.8, y: 10, duration: 0.2, ease: "power2.in" })   // crouch
  .to(char, { scaleY: 1.1, y: -100, duration: 0.3, ease: "power2.out" }) // jump
  .to(char, { y: 0, scaleY: 1.0, duration: 0.3, ease: "bounce.out" });   // land
```

**Key rule:** Anticipation duration ≈ 10–20% of the main action. The faster/larger the main action, the bigger the anticipation. Slow actions may not need anticipation at all.

---

## 3. Staging

**What:** Present the action clearly so the audience understands exactly what's happening. One main focus at a time.

**When to apply:**
- Scene composition: lead the eye to the primary action
- Enter/exit choreography: only one major move at a time
- Camera framing (or canvas composition in our case)
- Emphasizing key moments with scale, contrast, or isolation

**GSAP implementation patterns:**
- Dim/mute secondary elements during a key action
- Use `zIndex`/opacity to control visual hierarchy
- Stagger entrances so elements arrive one at a time, not all at once
- Scale the focal element slightly larger than its neighbors

```js
// Stage a key element: dim others, spotlight the hero
const tl = gsap.timeline();
tl.to(backgroundElements, { opacity: 0.3, duration: 0.3 })
  .to(heroElement, { scale: 1.05, duration: 0.4, ease: "back.out(1.2)" }, "-=0.2");
```

**Key rule:** If the audience can't tell what to look at within 0.5s, staging is wrong. Test by squinting — the focal point should still be obvious.

---

## 4. Straight Ahead & Pose-to-Pose

**What:** Two approaches to animation:
- **Straight ahead:** Animate frame-by-frame from start to end. Fluid, spontaneous, but unpredictable.
- **Pose-to-pose:** Define key poses first, then fill in-betweens. Controlled, planned, but can feel stiff.

**When to apply each:**
- **Pose-to-pose** (our default in code): most UI/scene animations. Plan keyframes, let GSAP interpolate.
- **Straight ahead feel:** fire, smoke, water, physics-based motion. Use GSAP's `physics2D` or procedural tweens.

**GSAP implementation:**
```js
// Pose-to-pose: define key poses as keyframes
gsap.to(element, {
  keyframes: [
    { x: 100, y: 0, duration: 0.5 },    // pose 1
    { x: 200, y: -50, duration: 0.3 },  // pose 2
    { x: 300, y: 0, duration: 0.4 },    // pose 3
  ],
  ease: "power1.inOut",
});
```

**Key rule:** For SceneConfig phases, use pose-to-pose thinking — define `phases[]` as key moments, let GSAP handle the in-betweens. For organic effects (particles, smoke), add randomness to make it feel straight-ahead.

---

## 5. Follow Through & Overlapping Action

**What:** Not everything stops at once. Different parts of a character/object move at different rates:
- **Follow through:** appendages continue moving after the main body stops (cape, hair, tail)
- **Overlapping action:** parts move with offset timing (arm swings after torso turns)

**When to apply:**
- Character stops running → cape/ponytail keeps swinging
- Menu opens → sub-items stagger in
- Balloon/string: balloon moves first, string trails
- Particles settle after an explosion

**GSAP implementation:**
```js
// Main body stops, cape settles with delay
const tl = gsap.timeline();
tl.to(body, { x: 200, duration: 0.5, ease: "power2.out" })
  .to(cape, { x: 200, duration: 0.5, ease: "power2.out" }, "-=0.4")   // starts with body
  .to(body, { x: 220, duration: 0.15, ease: "power2.inOut" })          // body overshoot → settle
  .to(cape, { x: 210, rotation: 5, duration: 0.4, ease: "elastic.out(1, 0.3)" }, "-=0.1") // cape keeps swaying
  .to(cape, { x: 220, rotation: 0, duration: 0.6, ease: "power2.out" });
```

**Key rule:** Lighter/looser parts trail more. Add 0.1–0.3s delay and softer easing to secondary elements. The more connected an element is to a rigid body, the less follow-through it has.

---

## 6. Slow In & Slow Out (Easing)

**What:** Motion accelerates from a stop and decelerates to a stop. Natural movement is never linear.

**When to apply:** **Almost always.** Linear motion (`ease: "none"`) is the exception, not the rule.

**Common easing patterns:**
| Context | Ease | GSAP |
|---|---|---|
| Gentle start, gentle stop | Sine | `power1.inOut`, `sine.inOut` |
| Strong start, soft land | Quint | `power4.in`, `back.out` |
| UI entrance | Back | `back.out(1.4)` |
| Bounce/playful | Bounce | `bounce.out` |
| Elastic/springy | Elastic | `elastic.out(1, 0.5)` |
| Smooth & professional | Expo | `expo.inOut` |

**GSAP implementation:**
```js
// Default good easing for most scene elements
gsap.to(element, { x: 300, duration: 0.6, ease: "power2.inOut" });

// Custom easing curve for precise artistic control
gsap.to(element, {
  x: 300,
  duration: 0.8,
  ease: CustomEase.create("myCurve", "M0,0 C0.2,0 0.4,1 1,1"),
});
```

**Key rule:** `ease: "none"` feels robotic — only use it for mechanical/matrix-like effects. For natural motion, always pair `powerN.in` starts with `powerN.out` stops, or use `inOut` for symmetric acceleration/deceleration.

---

## 7. Arcs

**What:** Natural movement follows curved paths, not straight lines. Jointed limbs trace arcs; thrown objects follow parabolic trajectories.

**When to apply:**
- Character arm/leg swings, head turns
- Thrown/flying objects (ball, paper plane)
- Orbiting UI elements
- Hand gestures, flourishes

**GSAP implementation:**
```js
// Arc via motionPath plugin (requires MotionPathPlugin)
gsap.to(ball, {
  motionPath: {
    path: [{ x: 0, y: 0 }, { x: 100, y: -80 }, { x: 200, y: 0 }],
    curviness: 1.5,
  },
  duration: 0.8,
  ease: "power1.inOut",
});

// Arc manually with two-axis tweens
const tl = gsap.timeline();
tl.to(ball, { x: 100, duration: 0.4, ease: "power1.in" });
tl.to(ball, { y: -80, duration: 0.2, ease: "power2.out" }, "-=0.3");
tl.to(ball, { x: 200, y: 0, duration: 0.4, ease: "power1.out" });

// SVG: rotate around a pivot point
gsap.to(arm, { rotation: 45, transformOrigin: "top center", duration: 0.4 });
```

**Key rule:** The faster the motion, the flatter the arc. A gentle toss has a pronounced arc; a bullet is nearly straight. Joint rotations naturally produce arcs — use `transformOrigin` to pivot correctly.

---

## 8. Secondary Action

**What:** A subtle additional animation that supports the main action without distracting from it. Adds depth and personality.

**When to apply:**
- Character walking: swinging arms (secondary) while legs walk (primary)
- Text appearing: slight shadow movement (secondary) while text scales in (primary)
- Button hover: subtle glow/ripple (secondary) while button lifts (primary)
- Frowning face: eyebrow tilt (secondary) during head shake (primary)

**GSAP implementation:**
```js
// Primary: character walks right. Secondary: arms swing, head bobs
const tl = gsap.timeline();
tl.to(character, { x: 300, duration: 1.0, ease: "power1.inOut" })       // primary
  .to(leftArm, { rotation: -20, duration: 0.25, yoyo: true, repeat: 3, ease: "sine.inOut" }, "-=0.9")  // secondary
  .to(rightArm, { rotation: 20, duration: 0.25, yoyo: true, repeat: 3, ease: "sine.inOut" }, "-=1.0")
  .to(head, { y: -3, duration: 0.15, yoyo: true, repeat: 5, ease: "sine.inOut" }, "-=1.0");
```

**Key rule:** Secondary actions should be 30–50% of the primary action's intensity. If the audience notices the secondary action before the primary, dial it back. Stagger the start by 0.05–0.15s.

---

## 9. Timing

**What:** The speed of an action conveys mass, emotion, and meaning. Fewer frames (faster) = lighter, energetic, urgent. More frames (slower) = heavier, thoughtful, grand.

**When to apply:** Always. Timing is the most fundamental design choice for every tween.

**Timing guidelines by feel:**
| Feel | Duration | Use case |
|---|---|---|
| Instant/snappy | 0.1–0.2s | Micro-interactions, hover states |
| Quick | 0.2–0.4s | UI transitions, small reveals |
| Natural | 0.4–0.8s | Character walks, scene entrances |
| Deliberate | 0.8–1.5s | Dramatic reveals, heavy objects |
| Grand | 1.5–3.0s | Epic introductions, slow pans |

**GSAP implementation:**
```js
// Weight through timing: light ball vs heavy ball
gsap.to(lightBall, { y: 200, duration: 0.4, ease: "bounce.out" });  // quick bounce, many bounces
gsap.to(heavyBall, { y: 200, duration: 0.8, ease: "bounce.out" });  // slow drop, few bounces

// Density through stagger
gsap.to(items, { opacity: 1, stagger: 0.08, duration: 0.3 });  // tight stagger = rapid-fire
gsap.to(items, { opacity: 1, stagger: 0.25, duration: 0.6 });  // loose stagger = leisurely
```

**Key rule:** Test at 1x speed. If it feels slow/rushed, adjust by 20–30%. The right timing makes weight and emotion readable in a single viewing.

---

## 10. Exaggeration

**What:** Push poses, timing, and effects beyond realism for clarity and impact. Not cartoony distortion — just "more than real."

**When to apply:**
- Impact/explosion: bigger flash, more particles
- Emphasis: text that bounces in larger than needed, then settles
- Expressions: surprised face opens wider than anatomically correct
- Speed lines / ghost trails on very fast moves

**GSAP implementation:**
```js
// Overshoot on entrance — scale past 1, then settle
gsap.fromTo(element,
  { scale: 0 },
  { scale: 1.0, duration: 0.5, ease: "back.out(2)" }  // overshoots to ~1.2, settles at 1
);

// Exaggerated bounce: more bounce iterations
gsap.to(heavy, {
  y: 200,
  duration: 1.2,
  ease: "bounce.out",  // built-in exaggeration
});

// Impact shake: exaggerated vibration
gsap.to(screen, {
  x: "+=10",
  duration: 0.05,
  repeat: 5,
  yoyo: true,
  ease: "power4.inOut",
});

// Double-take: oversized scale pulse
const tl = gsap.timeline();
tl.to(element, { scale: 1.0, duration: 0.3, ease: "power2.out" })
  .to(element, { scale: 1.4, duration: 0.15, ease: "power3.in" })   // exaggerated overshoot
  .to(element, { scale: 1.0, duration: 0.3, ease: "elastic.out(1, 0.4)" });
```

**Key rule:** Exaggeration should serve clarity, not chaos. Push ONE aspect (scale, timing, or effect) while keeping others grounded. The audience should feel "wow" not "what?"

---

## 11. Solid Drawing (Solid Design in Code)

**What:** Characters/elements feel three-dimensional with weight, volume, and balance. In traditional: understanding 3D form to draw convincingly. In our context: thinking in 3D space even when rendering 2D.

**When to apply:**
- Elements should have visual depth (shadows, gradients, perspective)
- Overlapping elements should respect z-depth ordering
- Characters should feel volumetric, not flat cutouts
- Camera-like motion (parallax: near moves faster than far)

**GSAP implementation patterns:**
```js
// Parallax depth: near layer moves faster than far
tl.to(nearLayer,  { x: -100, duration: 1.0 }, 0);
tl.to(midLayer,   { x: -50,  duration: 1.0 }, 0);
tl.to(farLayer,   { x: -20,  duration: 1.0 }, 0);

// 3D-ish rotation via perspective transforms
gsap.to(element, {
  rotationY: 15,
  rotationX: -5,
  transformPerspective: 600,
  duration: 0.6,
});

// Shadow follows elevation: higher = bigger, more blurred shadow
gsap.to(element,  { y: -30, duration: 0.4 });
gsap.to(shadow,   { scale: 1.2, opacity: 0.3, duration: 0.4 }, "-=0.4");
```

**Key rule:** Every element on screen should feel like it has mass and occupies space. Add shadows, use z-ordering, and think about how depth affects motion speed.

---

## 12. Appeal

**What:** The animation should be pleasing to watch. Characters feel charismatic; motion has rhythm and style. Not "cute" — "compelling."

**When to apply:** Every animation you design. Appeal is the sum of all other principles applied with taste.

**Techniques for appeal in code:**
- **Rhythm:** vary durations — 0.3s, 0.5s, 0.2s feels musical; all 0.4s feels monotonous
- **Curve variety:** mix `back.out` (playful) with `power2.inOut` (grounded) within a scene
- **Asymmetry:** elements enter in 3-5-2 pattern, not 5-5-5
- **Surprise:** one element behaves differently than expected (the "hero" element gets special treatment)
- **Whitespace in time:** leave 0.2–0.4s pauses between major beats
- **Contrast:** pair fast entrances (0.2s) with slow settles (0.8s)

```js
// Rhythmic entrance sequence
const tl = gsap.timeline();
tl.to(hero,    { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" })   // hero first, dramatic
  .to(support1, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" }, "-=0.2") // support staggered
  .to(support2, { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, "-=0.15")
  .to(detail,  { opacity: 0.6, duration: 0.8, ease: "sine.inOut" }, "+=0.1");     // subtle ambient settle
```

**Key rule:** Watch the animation once at full speed. If it feels boring, add rhythm contrast. If it feels chaotic, reduce simultaneous elements to 1–2 at a time.

---

## Quick Reference: Principle → GSAP Technique

| # | Principle | Primary GSAP Tools |
|---|---|---|
| 1 | Squash & Stretch | `scaleX`, `scaleY` tweens, maintain volume |
| 2 | Anticipation | Timeline: pre-action tween (10-20% of main duration) |
| 3 | Staging | Opacity on background, `zIndex`, stagger, scale up focal element |
| 4 | Straight Ahead / Pose-to-Pose | `keyframes: []` for poses; random/procedural for straight-ahead |
| 5 | Follow Through & Overlap | Staggered `"-=0.X"` position params, softer easing on secondary |
| 6 | Slow In & Slow Out | `ease: "powerN.inOut"`, `CustomEase` for precise curves |
| 7 | Arcs | `motionPath`, two-axis tweens, `rotation` with `transformOrigin` |
| 8 | Secondary Action | Parallel tweens at 30-50% intensity, offset start by 0.05–0.15s |
| 9 | Timing | Choose duration by feel (0.1–3.0s range), stagger for density |
|10 | Exaggeration | `back.out`, `elastic.out`, `bounce.out`, overshoot, shake |
|11 | Solid Drawing | Shadows, parallax, `transformPerspective`, `rotationY/X`, z-ordering |
|12 | Appeal | Rhythmic durations, easing variety, asymmetry, pauses, contrast |

## Applying Principles to SceneConfig

When building a `SceneConfig` for this studio, weave principles into phase design:

```json
{
  "phases": [
    {
      "name": "anticipation",
      "duration": 0.3,
      "effects": [
        { "type": "scale", "target": "hero", "to": { "scaleX": 0.85, "scaleY": 1.15 }, "ease": "power2.in" }
      ]
    },
    {
      "name": "main-action",
      "duration": 0.5,
      "effects": [
        { "type": "move", "target": "hero", "to": { "y": -120 }, "ease": "power2.out" },
        { "type": "move", "target": "cape", "to": { "y": -100 }, "ease": "power1.out", "delay": 0.08 }
      ]
    },
    {
      "name": "follow-through",
      "duration": 0.6,
      "effects": [
        { "type": "move", "target": "hero", "to": { "y": 0 }, "ease": "bounce.out" },
        { "type": "move", "target": "cape", "to": { "y": 0 }, "ease": "elastic.out(1, 0.3)", "delay": 0.15 }
      ]
    }
  ]
}
```

**Default principle checklist for every scene:**
- [ ] At least 3 principles intentionally used
- [ ] Easing is never `"none"` (principle 6)
- [ ] Main action is clearly staged (principle 3)
- [ ] Timing varies across elements (principles 9 + 12)
- [ ] Entrances have anticipation or overshoot (principles 2 + 10)
