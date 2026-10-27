import { getDocument, PDFWorker, type PDFDocumentProxy, type PDFDocumentLoadingTask, type RenderTask } from 'pdfjs-dist';
import { workerSource } from './workerSource';
import { decodeDocument, normalizeDocument, parseField, type SelectedField } from './metadata';

export class PdfViewer {
    private root = document.createElement('div');
    private toolbar = document.createElement('div');
    private status = document.createElement('div');
    private scroller = document.createElement('div');
    private pageElement = document.createElement('div');
    private pageLabel = document.createElement('span');
    private zoomLabel = document.createElement('span');
    private previous: HTMLButtonElement;
    private next: HTMLButtonElement;
    private observer: ResizeObserver;
    private pdf?: PDFDocumentProxy;
    private loading?: PDFDocumentLoadingTask;
    private worker?: PDFWorker;
    private workerUrl?: string;
    private renderTask?: RenderTask;
    private documentKey?: string;
    private normalizedDocument?: { content: string; key: string };
    private fieldKey?: string;
    private field: SelectedField = {};
    private fieldError = '';
    private documentError = '';
    private label = '';
    private page = 1;
    private zoom = 1;
    private generation = 0;
    private renderGeneration = 0;
    private destroyed = false;
    private resizeFrame = 0;
    private lastWidth = 0;
    private scrollPending = false;

    constructor(container: HTMLElement) {
        this.root.className = 'zengroq-pdf';
        this.toolbar.className = 'zengroq-pdf-toolbar';
        this.toolbar.setAttribute('aria-label', 'PDF controls');
        this.status.className = 'zengroq-pdf-status';
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');
        this.scroller.className = 'zengroq-pdf-scroll';
        this.scroller.tabIndex = 0;
        this.scroller.setAttribute('aria-label', 'PDF page');
        this.pageElement.className = 'zengroq-pdf-page';
        this.previous = this.button('Previous page', () => this.changePage(-1));
        this.toolbar.append(this.pageLabel);
        this.next = this.button('Next page', () => this.changePage(1));
        this.button('Zoom out', () => this.setZoom(this.zoom - 0.25));
        this.toolbar.append(this.zoomLabel);
        this.button('Zoom in', () => this.setZoom(this.zoom + 0.25));
        this.button('Fit width', () => this.setZoom(1));
        this.scroller.append(this.pageElement);
        this.root.append(this.toolbar, this.status, this.scroller);
        container.append(this.root);
        this.observer = new ResizeObserver(() => {
            const width = this.scroller.clientWidth;
            if (width === this.lastWidth) return;
            this.lastWidth = width;
            cancelAnimationFrame(this.resizeFrame);
            this.resizeFrame = requestAnimationFrame(() => { void this.render(); });
        });
        this.observer.observe(this.scroller);
        this.refreshStatus();
    }
    private button(label: string, action: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label; button.onclick = action;
        this.toolbar.append(button); return button;
    }
    update(content: string, metadata: string, name: string): void {
        if (this.destroyed) return;
        let cachedDocument = this.normalizedDocument;
        if (!cachedDocument || cachedDocument.content !== content) {
            cachedDocument = { content, key: normalizeDocument(content) };
            this.normalizedDocument = cachedDocument;
        }
        const key = cachedDocument.key;
        const changed = key !== this.documentKey;
        const fieldChanged = metadata !== this.fieldKey || name !== this.label;
        this.label = name;
        if (fieldChanged) {
            this.fieldKey = metadata; this.fieldError = ''; this.field = {};
            try { this.field = parseField(metadata); }
            catch (error) { this.fieldError = (error as Error).message; }
            this.scrollPending = true;
        }
        if (changed) { this.documentKey = key; void this.load(key); }
        else if (fieldChanged && this.pdf) { this.selectPage(); void this.render(); }
        this.refreshStatus();
    }
    private releaseDocument(): void {
        this.renderTask?.cancel(); this.renderTask = undefined;
        const loading = this.loading; this.loading = undefined; this.pdf = undefined;
        if (loading) void loading.destroy().catch(() => undefined);
        this.worker?.destroy(); this.worker = undefined;
        this.workerPort?.terminate(); this.workerPort = undefined;
        if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
        this.workerUrl = undefined;
    }
    private async load(key: string): Promise<void> {
        const generation = ++this.generation;
        ++this.renderGeneration;
        this.releaseDocument(); this.pageElement.replaceChildren();
        this.page = 1; this.documentError = '';
        delete this.root.dataset.renderedPage;
        if (!key) { this.refreshStatus(); return; }
        try {
            const data = decodeDocument(key);
            this.workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
            const port = new Worker(this.workerUrl, { type: 'module' });
            // PDF.js 5.4's generated declarations infer `port` as null although its
            // runtime explicitly supports a browser Worker. Keep this cast at the boundary.
            this.worker = new PDFWorker({ port } as unknown as ConstructorParameters<typeof PDFWorker>[0]);
            // PDFWorker does not own externally supplied ports; destroy terminates ours explicitly.
            this.workerPort = port;
            this.loading = getDocument({ data, worker: this.worker, isEvalSupported: false });
            this.refreshStatus();
            const pdf = await this.loading.promise;
            if (this.destroyed || generation !== this.generation) return;
            this.pdf = pdf; this.selectPage(); this.scrollPending = true;
            await this.render();
        } catch (error) {
            if (this.destroyed || generation !== this.generation) return;
            this.documentError = `Unable to open PDF: ${(error as Error).message}`;
            this.releaseDocument();
        }
        this.refreshStatus();
    }
    private workerPort?: Worker;
    private selectPage(): void {
        if (this.field.location && this.pdf && this.field.location.page <= this.pdf.numPages) this.page = this.field.location.page;
    }
    private changePage(delta: number): void {
        if (!this.pdf) return;
        this.page = Math.max(1, Math.min(this.pdf.numPages, this.page + delta));
        this.scroller.scrollTop = 0; void this.render();
    }
    private setZoom(zoom: number): void {
        this.zoom = Math.max(0.25, Math.min(4, zoom));
        this.scrollPending = true; void this.render(); this.refreshStatus();
    }
    private refreshStatus(): void {
        this.previous.disabled = !this.pdf || this.page <= 1;
        this.next.disabled = !this.pdf || this.page >= this.pdf.numPages;
        this.pageLabel.textContent = this.pdf ? `Page ${this.page} of ${this.pdf.numPages}` : 'No PDF loaded';
        this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
        const locationError = this.pdf && this.field.location && this.field.location.page > this.pdf.numPages ? 'Field page is outside this document.' : '';
        this.status.textContent = this.documentError || this.fieldError || locationError ||
            (!this.documentKey ? 'Provide a PDF document.' : !this.pdf ? 'Loading PDF...' :
                !this.field.location ? 'No location available' : `${this.label || 'Selected field'} - page ${this.field.location.page}`);
    }
    private async render(): Promise<void> {
        const pdf = this.pdf;
        if (!pdf || this.destroyed) return;
        const revision = ++this.renderGeneration;
        this.renderTask?.cancel();
        try {
            const page = await pdf.getPage(this.page);
            if (this.destroyed || revision !== this.renderGeneration) return;
            if (page.rotate !== 0) {
                this.pageElement.replaceChildren();
                this.documentError = 'Rotated PDF pages are not supported. Flatten page rotation before viewing.';
                this.refreshStatus(); return;
            }
            this.documentError = '';
            const original = page.getViewport({ scale: 1 });
            const scale = Math.max(100, this.scroller.clientWidth - 32) / original.width * this.zoom;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const ratio = window.devicePixelRatio || 1;
            canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
            canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
            canvas.setAttribute('aria-label', `PDF page ${this.page}`);
            this.pageElement.style.width = `${viewport.width}px`; this.pageElement.style.height = `${viewport.height}px`;
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 1 1'); svg.setAttribute('preserveAspectRatio', 'none');
            svg.classList.add('zengroq-pdf-overlay');
            this.pageElement.replaceChildren(canvas, svg);
            let rect: SVGRectElement | undefined;
            if (!this.fieldError && this.field.location?.page === this.page) {
                const box = this.field.location.boundingBox;
                rect = document.createElementNS(svg.namespaceURI, 'rect') as SVGRectElement;
                for (const [attribute, value] of Object.entries({ x: box.left, y: box.top, width: box.width, height: box.height })) rect.setAttribute(attribute, String(value));
                rect.setAttribute('class', (this.field.confidence ?? 0) > 0.9 ? 'confidence-high' : 'confidence-low');
                rect.setAttribute('vector-effect', 'non-scaling-stroke');
                const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = this.label || 'Selected field';
                rect.append(title); svg.append(rect);
            }
            this.refreshStatus();
            const task = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
            this.renderTask = task; await task.promise;
            if (this.destroyed || revision !== this.renderGeneration) return;
            if (rect && this.scrollPending) {
                const box = this.field.location!.boundingBox;
                this.scroller.scrollTop = Math.max(0, box.top * viewport.height - this.scroller.clientHeight / 2 + box.height * viewport.height / 2);
                this.scroller.scrollLeft = Math.max(0, box.left * viewport.width - this.scroller.clientWidth / 2 + box.width * viewport.width / 2);
                this.scrollPending = false;
            }
            this.root.dataset.renderedPage = String(this.page);
        } catch (error) {
            if (this.destroyed || revision !== this.renderGeneration || (error as Error).name === 'RenderingCancelledException') return;
            this.documentError = `Unable to render PDF: ${(error as Error).message}`; this.refreshStatus();
        }
    }
    destroy(): void {
        this.destroyed = true; ++this.generation; ++this.renderGeneration;
        this.observer.disconnect(); cancelAnimationFrame(this.resizeFrame);
        this.releaseDocument(); this.workerPort?.terminate(); this.root.remove();
    }
}
