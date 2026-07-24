---
id: "distortion-module-2026-07-23"
status: "todo"
priority: "medium"
assignee: null
epic: null
dueDate: null
created: "2026-07-24T03:46:46.097Z"
modified: "2026-07-24T04:00:52.659Z"
completedAt: null
labels: []
order: "a8"
---
# Distortion Module

Add a distortion and chromatic abberation module.

Should at the very least support Barrel and Pincusion distortion. Should support chromatic aberration. The distortion can be done minimally with a concave/convex knob. At zero, there should be no distortion, meaning the module can double as a simple chromatic aberration tool. We should investigate using two separate concave and convex knobs. This way we might be able to use it as a "mix" and generate mustache distortion. Depends on how hard it is to implement chromatic abberration to be general. The chromatic abberration should scale with the degree of field distortion. Red, Green, and Blue should each have X and Y offset, blur, zoom, and intensity knobs. Intensity is the strength of the warping as the field distortion moves to extreme values. It affects how the colours scale and map to the distortion.

\
[https://en.wikipedia.org/wiki/Distortion\\\_(optics)](https://en.wikipedia.org/wiki/Distortion%5C_\(optics\))