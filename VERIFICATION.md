# Local verification

Verified on Windows on October 27, 2026. No Dataverse authentication, import, app publishing, AI service call, commit, or GitHub push was performed.

## Prerequisites

| Tool | Observed version |
| --- | --- |
| Node.js | 24.22.1 |
| npm | 11.19.1 |
| .NET SDK | 10.0.403 |
| Git | 2.31.1.windows.1 |
| VS Code Power Platform Tools | 2.0.158 |
| Repository-local PAC CLI | 2.14.1 |
| PCF npm tools | 1.51.1 |
| Microsoft PCF / solution MSBuild packages | 1.52.1 |
| PDF.js | 5.4.624 |

PAC was absent from PATH. Installed Microsoft's CLI into the ignored `.tools/pac` directory and used it only for local scaffolding and adding the project reference. The sandbox restricted some user-profile writes; .NET restore/build used `DOTNET_CLI_HOME` and `NUGET_PACKAGES` inside `.tools`. The repository projects do not require those environment overrides on a normal developer machine.

## Successful checks

- Production PCF build: manifest validation, generated input types, Microsoft's ESLint checks, TypeScript compilation, Webpack bundling, CSS and localized license resource generation.
- Unmanaged solution packaging using Microsoft's MSBuild targets. `SolutionPackageType=Unmanaged` is explicit. The ZIP contains the control manifest, bundle, CSS, bundle license notice, full PDF.js license resource, solution manifest, and customization metadata. The solution manifest records `Managed=0`.
- Six Playwright tests in headless Chromium, using real PDF.js rendering:
  1. Page-2 selection, nonblank rendered document pixels, green high-confidence box, scroll into view, zoom, horizontal and vertical scrolling, resize alignment, page-1 selection, manual page navigation, orange low confidence, and orange confidence exactly 0.9. Geometry is compared with normalized metadata, including after canvas size changes.
  2. Missing location, invalid JSON, invalid object, invalid page, out-of-bounds box, nonexistent document page, structurally invalid PDF bytes, and recovery with a valid document.
  3. Equivalent raw base64 and PDF data URL reuse one document load; selection changes reuse that load. Rapid document replacement followed by destruction removes the component cleanly.
  4. Nonzero page rotation produces an explanatory error; an unrotated page in the same PDF remains viewable.
  5. The actual minified production PCF bundle runs through its adapter with a simulated PCF context, renders page 2 and its highlight, destroys its DOM, and makes no external HTTP requests.
  6. At 50% zoom with real Windows-style scrollbars enabled, resizing the viewer across the overflow threshold settles without width oscillation or repeated renders. The regression failed before the fix: at viewer heights of 570 and 575 pixels, widths alternated between 781 and 798 pixels and the canvas was replaced 12-13 times in 200 ms. Reserving the scrollbar gutter removes that feedback loop. Playwright's normal `--hide-scrollbars` option is disabled for this test because it masked the bug in the original suite.
- Full rendered canvas images of both fictional PDF pages were visually inspected for clipping, overlapping text, and legibility. The preview highlight was also visually checked over the amount.
- Git's untracked-file listing was reviewed: dependency folders, local tooling, generated worker, build/test outputs, and solution ZIP are ignored. No existing user files were deleted.

Run `npm run build` before `npm test`; the fifth test intentionally loads the production build. Tests create ignored images under `test-results/`. The test configuration automatically starts and stops the local Vite preview server.

## Warnings and limits

- Webpack reports three performance warnings because the self-contained API/worker bundle is about 2.4 MiB. Compilation and packaging succeed; these are size advisories.
- Root npm dependencies audited with zero reported vulnerabilities. Microsoft's current PCF development-tool dependency tree reports six moderate advisories involving Application Insights / OpenTelemetry. These tools are not shipped in the browser bundle. PCF tool versions are pinned; no forced downgrade or incompatible override is applied.
- A preview hot reload initially interrupted one test while the build was changing files. A separate production-bundle check initially encountered Vite's JavaScript transformation; it now injects the actual compiled bytes. Both were corrected and the complete suite passed afterward.
- Power Apps Studio import, runtime in Dataverse, mobile clients, tenant-specific Blob worker policies, large production PDFs, and PDFs requiring optional CMaps/font/WASM assets were not tested. These need a manual development-environment smoke test before use. Rotation and optional-resource limitations are documented in README.
