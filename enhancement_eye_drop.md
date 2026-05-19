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