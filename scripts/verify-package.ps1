param([string]$Path = 'artifacts/ZengroqPdfViewerWithHighlights_1_1_0_0_unmanaged.zip')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $Path))
try {
    function Read-ZipText([string]$Name) {
        $entry = $archive.GetEntry($Name)
        if (-not $entry) { throw "Missing ZIP entry: $Name" }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    [xml]$solutionXml = Read-ZipText 'solution.xml'
    if ($solutionXml.ImportExportXml.SolutionManifest.Managed -ne '0') { throw 'Expected unmanaged solution' }
    if ($solutionXml.ImportExportXml.SolutionManifest.Version -ne '1.1.0.0') { throw 'Expected solution version 1.1.0.0' }
    if ($solutionXml.ImportExportXml.SolutionManifest.UniqueName -ne 'ZengroqPdfViewerWithHighlights') { throw 'Unexpected solution identity' }
    $prefix = 'Controls/zengroq_Zengroq.PdfViewerWithHighlights/'
    [xml]$manifest = Read-ZipText ($prefix + 'ControlManifest.xml')
    if ($manifest.manifest.control.version -ne '1.1.0') { throw 'Expected component version 1.1.0' }
    if ($manifest.manifest.control.namespace -ne 'Zengroq' -or $manifest.manifest.control.constructor -ne 'PdfViewerWithHighlights') { throw 'Unexpected control identity' }
    $properties = @($manifest.manifest.control.property | ForEach-Object { $_.name })
    if (@(Compare-Object $properties @('DocumentBase64','SelectedFieldJson','SelectedFieldName')).Count -ne 0) { throw 'Unexpected input properties' }
    foreach ($name in @('bundle.js','bundle.js.LICENSE.txt','css/PdfViewer.css','strings/PdfViewer.1033.resx')) {
        if (-not $archive.GetEntry($prefix + $name)) { throw "Missing control resource: $name" }
    }
    $bundle = Read-ZipText ($prefix + 'bundle.js')
    $built = [IO.File]::ReadAllText((Resolve-Path 'component/out/controls/PdfViewerWithHighlights/bundle.js'))
    if ($bundle -cne $built) { throw 'ZIP does not contain the current compiled bundle' }
    if ((Read-ZipText ($prefix + 'strings/PdfViewer.1033.resx')) -notmatch 'Apache License') { throw 'Missing full dependency license' }
    if ((Read-ZipText ($prefix + 'strings/PdfViewer.1033.resx')) -notmatch 'CoreJS Company') { throw 'Missing core-js polyfill license' }
    Write-Output 'Verified unmanaged ZIP, control identity, three inputs, current bundle, CSS, and license resources.'
} finally { $archive.Dispose() }
