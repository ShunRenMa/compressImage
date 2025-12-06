import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import JSZip from 'jszip';

interface ImageItem {
    id: string;
    file: File;
    originalUrl: string;
    compressedBlob?: Blob;
    compressedUrl?: string;
}

class ImageCompressor {
    private ffmpeg: FFmpeg;
    private images: Map<string, ImageItem> = new Map();
    private isFFmpegLoaded = false;

    constructor() {
        this.ffmpeg = new FFmpeg();
        this.init();
    }

    private async init(): Promise<void> {
        this.setupEventListeners();
        this.setStatus('準備中...');

        try {
            await this.ffmpeg.load();
            this.isFFmpegLoaded = true;
            this.setStatus('就緒');
        } catch (error) {
            this.setStatus('FFmpeg 載入失敗: ' + error);
        }
    }

    private setupEventListeners(): void {
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        const dropZone = document.getElementById('drop-zone') as HTMLElement;
        const compressAllBtn = document.getElementById('compress-all-btn') as HTMLButtonElement;
        const downloadAllBtn = document.getElementById('download-all-btn') as HTMLButtonElement;
        const clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;

        // 檔案選擇
        fileInput.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) this.handleFiles(files);
        });

        // 拖放上傳
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.background = '#e0e0e0';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.background = '';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.background = '';
            if (e.dataTransfer?.files) {
                this.handleFiles(e.dataTransfer.files);
            }
        });

        // 批次操作
        compressAllBtn.addEventListener('click', () => this.compressAll());
        downloadAllBtn.addEventListener('click', () => this.downloadAllAsZip());
        clearAllBtn.addEventListener('click', () => this.clearAll());
    }

    private handleFiles(files: FileList): void {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));

        for (const file of imageFiles) {
            const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const item: ImageItem = {
                id,
                file,
                originalUrl: URL.createObjectURL(file)
            };
            this.images.set(id, item);
            this.renderImageItem(item);
        }

        this.updateBatchActions();
    }

    private renderImageItem(item: ImageItem): void {
        const list = document.getElementById('image-list') as HTMLElement;

        const div = document.createElement('div');
        div.id = item.id;
        div.style.cssText = 'border:1px solid #ccc; padding:10px; margin:10px 0; display:flex; gap:10px; align-items:center;';

        div.innerHTML = `
            <img src="${item.originalUrl}" style="max-width:100px; max-height:100px;">
            <div style="flex:1;">
                <div><strong>${item.file.name}</strong></div>
                <div>原始大小: ${this.formatSize(item.file.size)}</div>
                <div class="compressed-info"></div>
            </div>
            <div>
                <button class="compress-btn">壓縮</button>
                <button class="download-btn" disabled>下載</button>
                <button class="remove-btn">移除</button>
            </div>
        `;

        const compressBtn = div.querySelector('.compress-btn') as HTMLButtonElement;
        const downloadBtn = div.querySelector('.download-btn') as HTMLButtonElement;
        const removeBtn = div.querySelector('.remove-btn') as HTMLButtonElement;

        compressBtn.addEventListener('click', () => this.compressImage(item.id));
        downloadBtn.addEventListener('click', () => this.downloadImage(item.id));
        removeBtn.addEventListener('click', () => this.removeImage(item.id));

        list.appendChild(div);
    }

    private async compressImage(id: string): Promise<void> {
        const item = this.images.get(id);
        if (!item || !this.isFFmpegLoaded) return;

        const div = document.getElementById(id);
        const compressBtn = div?.querySelector('.compress-btn') as HTMLButtonElement;
        const downloadBtn = div?.querySelector('.download-btn') as HTMLButtonElement;
        const infoDiv = div?.querySelector('.compressed-info') as HTMLElement;

        if (compressBtn) compressBtn.disabled = true;
        if (infoDiv) infoDiv.textContent = '壓縮中...';

        try {
            const format = (document.getElementById('format-select') as HTMLSelectElement).value;
            const quality = parseInt((document.getElementById('quality-select') as HTMLSelectElement).value);
            const scale = parseFloat((document.getElementById('scale-select') as HTMLSelectElement).value);

            // 讀取原始圖片尺寸
            const img = new Image();
            await new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.src = item.originalUrl;
            });

            const targetWidth = Math.round(img.width * scale);
            const targetHeight = Math.round(img.height * scale);

            // 寫入檔案到 FFmpeg
            const inputName = 'input' + this.getExtension(item.file.name);
            const outputName = `output.${format}`;

            await this.ffmpeg.writeFile(inputName, await fetchFile(item.file));

            // 執行壓縮
            const ffmpegQuality = Math.max(1, Math.min(31, Math.round((100 - quality) / 3)));

            if (format === 'jpeg') {
                await this.ffmpeg.exec([
                    '-i', inputName,
                    '-vf', `scale=${targetWidth}:${targetHeight}`,
                    '-q:v', ffmpegQuality.toString(),
                    '-y', outputName
                ]);
            } else if (format === 'png') {
                await this.ffmpeg.exec([
                    '-i', inputName,
                    '-vf', `scale=${targetWidth}:${targetHeight}`,
                    '-y', outputName
                ]);
            } else if (format === 'webp') {
                await this.ffmpeg.exec([
                    '-i', inputName,
                    '-vf', `scale=${targetWidth}:${targetHeight}`,
                    '-quality', quality.toString(),
                    '-y', outputName
                ]);
            }

            // 讀取結果
            const data = await this.ffmpeg.readFile(outputName);
            const blob = new Blob([data], { type: `image/${format}` });

            // 清理舊的 URL
            if (item.compressedUrl) {
                URL.revokeObjectURL(item.compressedUrl);
            }

            item.compressedBlob = blob;
            item.compressedUrl = URL.createObjectURL(blob);

            // 清理 FFmpeg 檔案
            await this.ffmpeg.deleteFile(inputName);
            await this.ffmpeg.deleteFile(outputName);

            // 更新 UI
            const reduction = Math.round((1 - blob.size / item.file.size) * 100);
            if (infoDiv) {
                infoDiv.textContent = `壓縮後: ${this.formatSize(blob.size)} (${reduction > 0 ? '-' : '+'}${Math.abs(reduction)}%)`;
            }
            if (downloadBtn) downloadBtn.disabled = false;

        } catch (error) {
            if (infoDiv) infoDiv.textContent = '壓縮失敗: ' + error;
        } finally {
            if (compressBtn) compressBtn.disabled = false;
        }
    }

    private async compressAll(): Promise<void> {
        this.setStatus('批次壓縮中...');
        for (const [id] of this.images) {
            await this.compressImage(id);
        }
        this.setStatus('批次壓縮完成');
    }

    private downloadImage(id: string): void {
        const item = this.images.get(id);
        if (!item?.compressedBlob || !item.compressedUrl) return;

        const format = (document.getElementById('format-select') as HTMLSelectElement).value;
        const name = item.file.name.replace(/\.[^.]+$/, '') + `_compressed.${format}`;

        const a = document.createElement('a');
        a.href = item.compressedUrl;
        a.download = name;
        a.click();
    }

    private async downloadAllAsZip(): Promise<void> {
        const zip = new JSZip();
        const format = (document.getElementById('format-select') as HTMLSelectElement).value;
        let count = 0;

        for (const [, item] of this.images) {
            if (item.compressedBlob) {
                const name = item.file.name.replace(/\.[^.]+$/, '') + `_compressed.${format}`;
                zip.file(name, item.compressedBlob);
                count++;
            }
        }

        if (count === 0) {
            alert('沒有已壓縮的圖片可下載');
            return;
        }

        this.setStatus('產生 ZIP 檔案中...');
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `compressed_images_${Date.now()}.zip`;
        a.click();

        URL.revokeObjectURL(url);
        this.setStatus(`已下載 ${count} 張圖片`);
    }

    private removeImage(id: string): void {
        const item = this.images.get(id);
        if (item) {
            URL.revokeObjectURL(item.originalUrl);
            if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
            this.images.delete(id);
        }
        document.getElementById(id)?.remove();
        this.updateBatchActions();
    }

    private clearAll(): void {
        for (const [id] of this.images) {
            this.removeImage(id);
        }
    }

    private updateBatchActions(): void {
        const batchActions = document.getElementById('batch-actions') as HTMLElement;
        batchActions.style.display = this.images.size > 0 ? 'block' : 'none';
    }

    private setStatus(message: string): void {
        const status = document.getElementById('status') as HTMLElement;
        status.textContent = message;
    }

    private formatSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    private getExtension(filename: string): string {
        const match = filename.match(/\.[^.]+$/);
        return match ? match[0] : '.jpg';
    }
}

// 啟動應用程式
document.addEventListener('DOMContentLoaded', () => {
    new ImageCompressor();
});
