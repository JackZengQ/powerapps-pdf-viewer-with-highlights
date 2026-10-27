# PDF viewer with highlights

`Zengroq.PdfViewerWithHighlights` is a reusable TypeScript PCF control for Power Apps canvas apps. PDF.js renders one page at a time into a canvas; an SVG in the same page container displays the selected AI Builder field's normalized bounding box. Documents stay local to the control. No AI services or CDN are used.

## Quick start

Use Node.js LTS (verified with 24.22.1), npm, and .NET SDK 6 or later (verified with 10.0.403). Power Platform Tools for VS Code is useful for PCF development. Git is needed for cloning. The PAC CLI is only needed to scaffold new projects; the committed projects build with npm and .NET.

From the repository root:

```powershell
npm ci
npm --prefix component ci
npm run preview
```

Open **http://127.0.0.1:5173**. The preview loads a fictional two-page invoice and its metadata. Select a field, edit its original JSON, upload a local PDF, navigate pages, zoom, or resize the viewer using its lower-right handle. The preview uses the same renderer as the PCF control. File uploads stay in browser memory.

## Build, test, and package

```powershell
npm run build
npx playwright install chromium
npm test
powershell -ExecutionPolicy Bypass -File scripts/package.ps1
```

`npm run build` validates the PCF manifest, generates property types, runs Microsoft's ESLint configuration, and creates a production bundle. The build embeds the pinned PDF.js worker into a generated TypeScript module. That module is ignored by Git and regenerated automatically before builds.

The packaging script restores official NuGet build packages, builds a production control, and explicitly selects **Unmanaged**, even in Release configuration. The development ZIP is:

```text
artifacts/ZengroqPdfViewerWithHighlights_1_0_0_0_unmanaged.zip
```

The original packaging output is `solution/bin/Release/solution.zip`. Both are ignored build artifacts. No authentication, Dataverse connection, import, publishing, or Git push occurs during these commands. See [Microsoft's packaging guidance](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/import-custom-controls).

For direct packaging without the helper:

```powershell
npm run prepare:worker
dotnet restore solution/solution.cdsproj
dotnet build solution/solution.cdsproj --no-restore -c Release -p:SolutionPackageType=Unmanaged -p:PcfBuildMode=production
```

## Import into a development environment

These are manual instructions; no import was performed by this repository's build.

1. Ask your administrator to enable **Power Apps component framework for canvas apps** under the environment's Settings > Product > Features.
2. At `make.powerapps.com`, select your development environment with Dataverse. In **Solutions > Import solution**, choose the unmanaged ZIP and complete import.
3. In your canvas app, choose **Add > Get more components > Code**, select **PDF viewer with highlights**, and import it into the app. Insert the component from Code components.
4. Give the control sufficient Width and Height (for example, 900 by 650), and bind its three input properties below.

For updates, increment the manifest version and solution version, rebuild and import, publish solution customizations, then close and reopen the canvas app to accept the component update. See [Microsoft's canvas PCF instructions](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/component-framework-for-canvas-apps).

## Property bindings

| Input | Type | Canvas formula example |
| --- | --- | --- |
| `DocumentBase64` | Text (`Multiple`) | `varPdfBase64` |
| `SelectedFieldJson` | Text (`Multiple`) | `If(IsBlank(varSelectedFieldName), "", JSON(varSelectedFieldMetadata, JSONFormat.Compact))` |
| `SelectedFieldName` | Text | `varSelectedFieldName` |

Set `varPdfBase64` to your PDF's raw base64 content, or a `data:application/pdf;base64,...` URL, using your existing document retrieval process. Supply the string directly, without JSON quotes. PDF URLs and arbitrary file URLs are not supported.

Keep each field's **original AI Builder metadata record** beside its display label. For example, if your gallery records contain `DisplayName` and `OriginalMetadata`, use this in the gallery's `OnSelect`:

```powerfx
Set(varSelectedFieldName, ThisItem.DisplayName);
Set(varSelectedFieldMetadata, ThisItem.OriginalMetadata)
```

The gallery names are examples you define in your app. Do not send only `valueText`, and do not reconstruct a bounding box from the display value. `SelectedFieldJson` must be JSON for the metadata object itself, rather than a JSON string containing escaped JSON.

For a self-contained test, set these variables in a button's `OnSelect`:

```powerfx
Set(varSelectedFieldName, "Invoice total");
Set(varSelectedFieldMetadata, {
    valueText: "$8,240.00",
    confidence: 0.943,
    location: {
        page: 2,
        boundingBox: { left: 0.8097, top: 0.6494, width: 0.1170, height: 0.0215 }
    }
})
```

Use the base64 representation of `samples/fictional-invoice.pdf` for `varPdfBase64`. PowerShell can copy this fictional fixture to your clipboard:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path samples/fictional-invoice.pdf))) | Set-Clipboard
```

## Metadata and behavior

```json
{
  "valueText": "$8,240.00",
  "confidence": 0.943,
  "location": {
    "page": 2,
    "boundingBox": { "left": 0.8097, "top": 0.6494, "width": 0.1170, "height": 0.0215 }
  }
}
```

- Pages are one-based. Coordinates are normalized to the full page, with a top-left origin. Boxes must have positive dimensions and stay within the page. Out-of-range pages produce an error rather than a fabricated location.
- A selection navigates to its page, draws its box, and scrolls the region into view. Manual page navigation shows a box only on its matching page.
- Confidence strictly above 0.9 is green. Confidence at or below 0.9, or absent confidence, is orange. Supplied confidence must be a number in `[0, 1]`.
- Missing or null `location`, or an empty metadata input, shows **No location available** and no box. Invalid JSON and invalid boxes show useful messages. PDF load/render errors do not crash the host.
- Zoom ranges from 25% to 400% of fit width. ResizeObserver recomputes fit width; canvas and SVG share identical page dimensions. The viewer reserves vertical scrollbar space to prevent repeated redraws near overflow thresholds, including at 50% zoom. Device pixel ratio affects canvas resolution, not normalized coordinates.
- The normalized PDF content is cached per instance. Changes only to selection, label, size, or zoom do not reload the document. Raw base64 and its equivalent PDF data URL share the same identity.
- Pending renders and stale asynchronous results are cancelled or ignored. Destruction disconnects the observer, cancels the animation frame and render, destroys PDF.js resources, terminates the worker, revokes its Blob URL, and removes the DOM.

## Limitations

- Only unrotated pages are supported. A page with nonzero PDF `/Rotate` is rejected with an explanatory message; preprocess such PDFs to flatten rotation and ensure the metadata matches that resulting page. Landscape pages with zero rotation are supported. No rotation coordinate transformation is attempted.
- The control renders a single active page, with previous/next navigation. It does not include text selection, search, annotations, forms, password entry, or a continuous all-pages view.
- The worker uses a local Blob module URL. The actual host must permit Blob workers. The local Chromium test verifies this technique, but Power Apps Studio, mobile clients, and tenant-specific CSP behavior still require a development-environment smoke test.
- The initial bundle includes the API and worker, but not PDF.js's optional external CMaps, standard-font files, or WASM image decoders. PDFs relying on those optional resources may render incompletely or show a rendering error. Latin text in this fixture is tested. No missing resources are fetched from a CDN.
- Large base64 strings and high zoom consume browser memory; Power Apps transport limits and representative production PDF sizes have not been benchmarked. The production JS is about 2.4 MiB and triggers Webpack performance-size warnings.

## Repository map

```text
component/   PCF manifest, adapter, renderer, metadata validation, scoped CSS
solution/    Microsoft solution project and fictional publisher metadata
samples/     Fictional invoice PDF and original field metadata
preview/     Local browser preview
scripts/     Sample generation, local worker preparation, solution packaging
tests/       Playwright tests against real PDF.js and the production adapter
licenses/    Required third-party license text
```

Only fictional samples belong in this public repository. Credentials, environment exports, dependency folders, generated types, local tools, test outputs, and solution ZIPs are ignored. No production document data is included. Existing `.vscode/settings.json` was left intact.

See [verification results](VERIFICATION.md) for the checks actually run and [third-party notices](THIRD_PARTY_NOTICES.md) for dependency licensing. To change the fixture, run `npm run samples`; it recreates the two-page fictional PDF and matching metadata.
