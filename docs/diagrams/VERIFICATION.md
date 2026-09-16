# Diagram verification

Checked on 2026-09-16. These are documentation-artifact checks, not production
deployment or database-verification results.

| Diagram | Deterministic Archify delivery | Static SVG visual review | HTML browser coverage | Exact-byte receipt |
| --- | --- | --- | --- | --- |
| System architecture | 9/9 showcase; 0 errors, 0 warnings | Passed, light preview | Failed before page capture | [Receipt](system-architecture.delivery.json) |
| Statement import | 9/9 showcase; 0 errors, 0 warnings | Passed, light preview | Not run | [Receipt](statement-import.delivery.json) |
| Financial calculations | 9/9 showcase; 0 errors, 0 warnings | Passed, light preview | Not run | [Receipt](financial-calculations.delivery.json) |
| Release delivery | 9/9 showcase; 0 errors, 0 warnings | Passed, light preview | Not run | [Receipt](release-delivery.delivery.json) |

Every receipt includes the specification, delivered HTML, and passive SVG
SHA-256 and byte counts. `node docs/diagrams/build.mjs --check` verifies those
bindings and that each SVG still derives from its delivered HTML.

The architecture receipt additionally verifies 12 repository references at
`a3a0958edcda2c1e03b4e8d7e3cb30a6dcc55997`. The import, financial, and release
source maps were checked against the current local files linked in the guide.
They do not claim a published commit for the uncommitted financial changes.

Static previews were rasterized with the already-installed Sharp 0.35.4
library and inspected with an image reader. All four were checked for readable
labels, unclipped nodes and legends, clear arrow directions, and separated
routes. One static-palette compatibility repair and one release-route repair
were completed. The full SVG geometry and the delivered HTML were preserved;
source edits were revalidated and redelivered.

This static review does not verify Archify's HTML controls, browser font
rendering, dark theme, or desktop viewport containment. Archify's supported
`visual-check` was attempted on the system architecture artifact. Chrome failed
to initialize its GPU process inside the available execution environment,
before any viewport measurement or screenshot completed. The outside-sandbox
retry was blocked by the session's automatic approval service. The other three
browser checks were not attempted after that environment failure.

## Remaining browser checks

In a browser-capable environment, run the supported `visual-check` command
for all four HTML files and inspect the generated light/dark screenshots.
Required desktop sizes are 1440x900, 1600x1000, 1920x1080, and 2048x1320.
Verify search/focus behavior, pan/zoom, theme switching, and export controls.
Record browser evidence separately from perceptual review and replace this
dated status only with evidence bound to the current artifact hashes.
