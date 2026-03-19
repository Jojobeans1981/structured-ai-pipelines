import JSZip from 'jszip';
import { FileManager } from '@/src/services/file-manager';

export class ZipGenerator {
  static async generateZip(projectId: string): Promise<Buffer | null> {
    const files = await FileManager.getProjectFilesWithContent(projectId);

    if (files.length === 0) return null;

    const zip = new JSZip();

    for (const file of files) {
      zip.file(file.filePath, file.content);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return buffer;
  }
}
