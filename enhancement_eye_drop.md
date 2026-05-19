Act as an Expert Frontend Engineer specializing in HTML5 Canvas applications, touch interfaces, and iOS Safari compatibility. 

Your task is to provide production-ready solutions and code for the following two tasks in our web-based canvas app. Always deliver a solution that goes beyond basic implementations by factoring in performance, edge cases, and exceptional UX.

Task 1: Fix iPad Browser UI Disappearance Bug
- Problem: On iPad browsers (Mobile Safari/Chrome), the Size bar, Opacity bar, and page navigator bar intermittently fail to render or completely disappear.
- Requirements: 
  1. Diagnose common iOS Safari quirks causing this (e.g., dynamic viewport height updates changing layout boundaries, z-index stacking context failures during canvas redraws, or hardware acceleration glitches).
  2. Provide a robust CSS/JS fix ensuring these control bars remain visible, properly layered, and responsive to orientation changes and address bar toggling.
  3. Ensure touch event listeners on these bars don't conflict with canvas drawing gestures (e.g., preventing accidental scrolling or canvas-drawn lines when moving sliders).

Task 2: Implement a High-Fidelity "Eye-Drop" Color Picker
- Problem: Need a tool that allows users to pick a color from anywhere on the canvas and set it as the active palette color.
- Requirements:
  1. Primary API: Use the modern browser EyeDropper API where supported.
  2. Fallback Solution: Provide a robust HTML5 Canvas fallback using context.getImageData() to sample pixel data coordinates for browsers/embeds where the EyeDropper API is unavailable.
  3. Advanced UX (Beyond the Basic): Implement a visual "magnifier loupe" (zoom bubble) that follows the user's touch/cursor during selection, allowing pixel-perfect precision on smaller iPad screens.
  4. Ensure proper handling of scaled/zoomed canvases so the sampled coordinate perfectly matches the visual pixel the user is pointing to.

Structure your response with clear root-cause explanations, clean and modular code snippets, and integration instructions for our existing app state.

Act as a Senior Frontend Engineer specializing in iOS Safari compatibility, Mobile WebKit, and mobile touch interactions. Always deliver a solution that goes beyond basic implementations by factoring in performance, edge cases, and exceptional UX.

Fix the following issue in our web-based canvas application on iPad browsers:

### The Bug:
When a user executes a "touch and hold" gesture on the canvas/UI to use the custom magnifier loupe color picker, the native iOS "select text" behavior takes over. This highlights text/objects and triggers the native OS callout menu (Copy, Paste, Look Up, etc.), completely breaking the custom tool interaction.

### Requirements for the Solution:
1. CSS Suppression: Provide the exact WebKit-specific CSS rules needed to disable native selection, highlighting, and callouts on the canvas and UI wrapper element (e.g., handling `-webkit-user-select`, `-webkit-touch-callout`, etc.) without breaking normal button clicks or text input fields elsewhere in the app.
2. JavaScript Event Handling: Provide the precise touch event listeners (`touchstart`, `touchend`, `contextmenu`) and where to apply `e.preventDefault()` or `e.stopPropagation()` to stop iOS from hijacking the long-press gesture, while still allowing our magnifier loupe logic to track the touch position.
3. Edge Cases: Ensure the fix doesn't accidentally disable double-tap zooming behaviors if they are needed, or conflict with dragging gestures when moving the loupe around the screen.

Deliver clean, modern JavaScript/CSS code snippets with a brief explanation of why this fixes WebKit's native behavior.


Act as a Senior Frontend UI/UX Engineer specializing in touch interfaces, mobile ergonomics, and canvas-based tools.
Fix a critical positioning and visibility bug with our custom magnifier loupe color picker on mobile/tablet touch screens.

### The Bug:
When a user presses and holds to trigger the magnifier loupe, the UI element renders significantly lower than the touch point, way far behind the user's finger. the user cannot see the magnifier loupe or the color they are sampling.

### Requirements for the Solution:
1. Ergonomic Positioning & Offset Math: 
   - Rewrite the positioning logic so the magnifier loupe is explicitly offset *above* the user's actual touch point (e.g., -80px to -120px Y-axis shift), ensuring it is perfectly visible just above the tip of their finger.
   - Provide the exact math to map the touch coordinates (`touches[0].clientX/Y` or `page/viewport` coordinates) accurately to the loupe's CSS absolute positioning or canvas rendering position.

2. "Beyond the Basic" Collision Detection (Viewport Boundaries):
   - Implement smart boundary detection. If the user touches near the very top edge of the screen where an upward offset would push the loupe off-screen, the loupe should dynamically flip to the side (left/right) or below the finger, staying fully within the visible viewport.

3. Performance & Tracking Smoothness:
   - Ensure that as the user drags their finger to sample colors, the loupe follows smoothly without lag. Use `requestAnimationFrame` or hardware-accelerated CSS transforms (`translate3d`) for 60 FPS performance during the `touchmove` event.

Deliver a clean, modular solution (JavaScript/TypeScript and CSS) with an explanation of the coordinate math used to achieve the ergonomic offset.