import { IInputs, IOutputs } from './generated/ManifestTypes';
import { PdfViewer } from './viewer';

export class PdfViewerWithHighlights implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private viewer?: PdfViewer;
    private container?: HTMLDivElement;
    public init(context: ComponentFramework.Context<IInputs>, _notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary, container: HTMLDivElement): void {
        this.container = container;
        context.mode.trackContainerResize(true);
        this.viewer = new PdfViewer(container);
    }
    public updateView(context: ComponentFramework.Context<IInputs>): void {
        if (this.container) {
            const { allocatedWidth, allocatedHeight } = context.mode;
            this.container.style.width = allocatedWidth > 0 ? `${allocatedWidth}px` : '100%';
            this.container.style.height = allocatedHeight > 0 ? `${allocatedHeight}px` : '600px';
        }
        this.viewer?.update(context.parameters.DocumentBase64.raw ?? '',
            context.parameters.SelectedFieldJson.raw ?? '', context.parameters.SelectedFieldName.raw ?? '');
    }
    public getOutputs(): IOutputs { return {}; }
    public destroy(): void { this.viewer?.destroy(); this.viewer = undefined; this.container = undefined; }
}
