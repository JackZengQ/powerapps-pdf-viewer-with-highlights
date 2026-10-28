// Each legacy bundle installs its own core-js shims before PDF.js initializes.
import { getDocument, PDFWorker, type PDFDocumentProxy, type PDFDocumentLoadingTask, type PDFPageProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { workerSource } from './workerSource';
import { decodeDocument, normalizeDocument, parseField, type SelectedField } from './metadata';

interface PageView {
    number: number;
    pdfPage: PDFPageProxy;
    element: HTMLDivElement;
    overlay: SVGSVGElement;
    width: number;
    height: number;
    canvas?: HTMLCanvasElement;
    task?: RenderTask;
    ready: boolean;
    error: string;
}

export class PdfViewer {
    private root = document.createElement('div');
    private toolbar = document.createElement('div');
    private status = document.createElement('div');
    private scroller = document.createElement('div');
    private pageLabel = document.createElement('span');
    private zoomLabel = document.createElement('span');
    private previous: HTMLButtonElement;
    private next: HTMLButtonElement;
    private observer: ResizeObserver;
    private pages: PageView[] = [];
    private pdf?: PDFDocumentProxy;
    private loading?: PDFDocumentLoadingTask;
    private worker?: PDFWorker;
    private workerPort?: Worker;
    private workerUrl?: string;
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
    private scrollFrame = 0;
    private lastWidth = 0;
    private scrollPending = false;
    private onScroll = (): void => {
        cancelAnimationFrame(this.scrollFrame);
        this.scrollFrame = requestAnimationFrame(() => this.updateVisiblePages());
    };

    constructor(container: HTMLElement) {
        this.root.className = 'zengroq-pdf';
        this.toolbar.className = 'zengroq-pdf-toolbar';
        this.toolbar.setAttribute('aria-label', 'PDF controls');
        this.status.className = 'zengroq-pdf-status';
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');
        this.scroller.className = 'zengroq-pdf-scroll';
        this.scroller.tabIndex = 0;
        this.scroller.setAttribute('aria-label', 'PDF pages');
        this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
        this.previous = this.button('Previous page', () => this.changePage(-1));
        this.toolbar.append(this.pageLabel);
        this.next = this.button('Next page', () => this.changePage(1));
        this.button('Zoom out', () => this.setZoom(this.zoom - 0.25));
        this.toolbar.append(this.zoomLabel);
        this.button('Zoom in', () => this.setZoom(this.zoom + 0.25));
        this.button('Fit width', () => this.setZoom(1));
        this.root.append(this.toolbar, this.status, this.scroller);
        container.append(this.root);
        this.observer = new ResizeObserver(() => {
            const width = this.scroller.clientWidth;
            if (width === this.lastWidth) { this.onScroll(); return; }
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
        else if (fieldChanged && this.pdf) {
            this.selectPage(); this.drawHighlights(); this.scrollToField(); this.updateVisiblePages(false);
        }
        this.refreshStatus();
    }
    private clearPages(): void {
        for (const view of this.pages) this.releaseCanvas(view);
        this.pages = [];
        this.scroller.replaceChildren();
        delete this.root.dataset.renderedPage;
    }
    private releaseCanvas(view: PageView): void {
        view.task?.cancel(); view.task = undefined;
        if (view.canvas) {
            view.canvas.width = 0; view.canvas.height = 0; view.canvas.remove(); view.canvas = undefined;
        }
        view.ready = false;
    }
    private releaseDocument(): void {
        this.clearPages();
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
        this.releaseDocument();
        this.page = 1; this.documentError = '';
        if (!key) { this.refreshStatus(); return; }
        try {
            const data = decodeDocument(key);
            this.workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
            const port = new Worker(this.workerUrl, { type: 'module' });
            // PDF.js 5.4's declarations infer port as null despite Worker support.
            this.worker = new PDFWorker({ port } as unknown as ConstructorParameters<typeof PDFWorker>[0]);
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
    private selectPage(): void {
        if (this.field.location && this.pdf && this.field.location.page <= this.pdf.numPages) this.page = this.field.location.page;
    }
    private pageTop(view: PageView): number {
        return view.element.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top + this.scroller.scrollTop;
    }
    private changePage(delta: number): void {
        if (!this.pdf) return;
        this.page = Math.max(1, Math.min(this.pdf.numPages, this.page + delta));
        const view = this.pages[this.page - 1];
        if (view) this.scroller.scrollTop = this.pageTop(view) - 16;
        this.scrollPending = false;
        this.updateVisiblePages(false);
    }
    private setZoom(zoom: number): void {
        const nextZoom = Math.max(0.25, Math.min(4, zoom));
        if (nextZoom === this.zoom) return;
        this.zoom = nextZoom;
        this.scrollPending = this.field.location?.page === this.page;
        void this.render(); this.refreshStatus();
    }
    private refreshStatus(): void {
        this.previous.disabled = !this.pdf || this.page <= 1;
        this.next.disabled = !this.pdf || this.page >= this.pdf.numPages;
        this.pageLabel.textContent = this.pdf ? `Page ${this.page} of ${this.pdf.numPages}` : 'No PDF loaded';
        this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
        const locationError = this.pdf && this.field.location && this.field.location.page > this.pdf.numPages ? 'Field page is outside this document.' : '';
        this.status.textContent = this.documentError || this.pages[this.page - 1]?.error || this.fieldError || locationError ||
            (!this.documentKey ? 'Provide a PDF document.' : !this.pdf ? 'Loading PDF...' :
                !this.field.location ? '' : `${this.label || 'Selected field'} - page ${this.field.location.page}`);
        if (this.pages[this.page - 1]?.ready) this.root.dataset.renderedPage = String(this.page);
        else delete this.root.dataset.renderedPage;
    }
    private drawHighlights(): void {
        for (const view of this.pages) {
            view.overlay.replaceChildren();
            if (view.error || this.fieldError || this.field.location?.page !== view.number) continue;
            const box = this.field.location.boundingBox;
            const rect = document.createElementNS(view.overlay.namespaceURI, 'rect') as SVGRectElement;
            for (const [attribute, value] of Object.entries({ x: box.left, y: box.top, width: box.width, height: box.height })) rect.setAttribute(attribute, String(value));
            rect.setAttribute('class', (this.field.confidence ?? 0) > 0.9 ? 'confidence-high' : 'confidence-low');
            rect.setAttribute('vector-effect', 'non-scaling-stroke');
            const title = document.createElementNS(view.overlay.namespaceURI, 'title'); title.textContent = this.label || 'Selected field';
            rect.append(title); view.overlay.append(rect);
        }
    }
    private scrollToField(): void {
        const location = this.field.location;
        const view = location && this.pages[location.page - 1];
        if (!this.scrollPending || !view || !location) return;
        const box = location.boundingBox;
        this.scroller.scrollTop = Math.max(0, this.pageTop(view) + (box.top + box.height / 2) * view.height - this.scroller.clientHeight / 2);
        this.scroller.scrollLeft = Math.max(0, view.element.offsetLeft + (box.left + box.width / 2) * view.width - this.scroller.clientWidth / 2);
        this.scrollPending = false;
    }
    private updateVisiblePages(trackPage = true): void {
        if (this.destroyed || !this.pages.length) return;
        const top = this.scroller.scrollTop;
        const height = this.scroller.clientHeight;
        let mostVisible = -1;
        for (const view of this.pages) {
            const pageTop = this.pageTop(view);
            const overlap = Math.max(0, Math.min(top + height, pageTop + view.height) - Math.max(top, pageTop));
            if (trackPage && overlap > mostVisible) { mostVisible = overlap; this.page = view.number; }
            // Keep only nearby page bitmaps; lightweight page containers and overlays
            // remain in the document so scrolling and field positions stay stable.
            if (pageTop + view.height >= top - height && pageTop <= top + height * 2) {
                if (!view.canvas && !view.error) void this.paintPage(view, this.renderGeneration);
            } else this.releaseCanvas(view);
        }
        this.refreshStatus();
    }
    private async paintPage(view: PageView, revision: number): Promise<void> {
        const canvas = document.createElement('canvas');
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.ceil(view.width * ratio); canvas.height = Math.ceil(view.height * ratio);
        canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`;
        canvas.setAttribute('aria-label', `PDF page ${view.number}`);
        view.canvas = canvas; view.element.prepend(canvas);
        try {
            const viewport = view.pdfPage.getViewport({ scale: view.width / view.pdfPage.getViewport({ scale: 1 }).width });
            const task = view.pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
            view.task = task; await task.promise;
            if (this.destroyed || revision !== this.renderGeneration || view.canvas !== canvas) return;
            view.task = undefined; view.ready = true;
            this.refreshStatus();
        } catch (error) {
            if (this.destroyed || revision !== this.renderGeneration || view.canvas !== canvas || (error as Error).name === 'RenderingCancelledException') return;
            view.error = `Unable to render PDF page ${view.number}: ${(error as Error).message}`;
            this.releaseCanvas(view); this.refreshStatus();
        }
    }
    private async render(): Promise<void> {
        const pdf = this.pdf;
        if (!pdf || this.destroyed) return;
        const revision = ++this.renderGeneration;
        const oldView = this.pages[this.page - 1];
        const anchor = oldView ? (this.scroller.scrollTop - this.pageTop(oldView)) / oldView.height : 0;
        const width = Math.max(100, this.scroller.clientWidth - 32) * this.zoom;
        const views: PageView[] = [];
        try {
            for (let number = 1; number <= pdf.numPages; number++) {
                const pdfPage = await pdf.getPage(number);
                if (this.destroyed || revision !== this.renderGeneration) return;
                const original = pdfPage.getViewport({ scale: 1, rotation: 0 });
                const element = document.createElement('div');
                element.className = 'zengroq-pdf-page'; element.dataset.pageNumber = String(number);
                element.setAttribute('role', 'group'); element.setAttribute('aria-label', `Page ${number}`);
                const height = original.height * width / original.width;
                element.style.width = `${width}px`; element.style.height = `${height}px`;
                const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                overlay.setAttribute('viewBox', '0 0 1 1'); overlay.setAttribute('preserveAspectRatio', 'none');
                overlay.classList.add('zengroq-pdf-overlay'); element.append(overlay);
                const error = pdfPage.rotate !== 0 ? 'Rotated PDF pages are not supported. Flatten page rotation before viewing.' : '';
                if (error) { const message = document.createElement('p'); message.textContent = `Page ${number}: ${error}`; element.append(message); }
                views.push({ number, pdfPage, element, overlay, width, height, ready: false, error });
            }
            this.clearPages(); this.pages = views;
            this.scroller.append(...views.map(view => view.element));
            this.drawHighlights();
            const view = this.pages[this.page - 1];
            if (this.scrollPending && this.field.location) this.scrollToField();
            else if (view) this.scroller.scrollTop = Math.max(0, this.pageTop(view) + anchor * view.height);
            this.updateVisiblePages(false);
        } catch (error) {
            if (this.destroyed || revision !== this.renderGeneration) return;
            this.documentError = `Unable to lay out PDF: ${(error as Error).message}`; this.refreshStatus();
        }
    }
    destroy(): void {
        this.destroyed = true; ++this.generation; ++this.renderGeneration;
        this.observer.disconnect(); cancelAnimationFrame(this.resizeFrame); cancelAnimationFrame(this.scrollFrame);
        this.scroller.removeEventListener('scroll', this.onScroll);
        this.releaseDocument(); this.root.remove();
    }
}
