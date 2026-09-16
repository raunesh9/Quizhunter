import type {Slide} from './types';
import {MAX_BATCH_BYTES} from './limits';

export function slideBytes(slide: Slide): number {
  return new TextEncoder().encode(JSON.stringify(slide)).byteLength;
}

export function studyBatches(slides: Slide[], mode: 'explain' | 'cards' | 'quiz'): Slide[][] {
  const batches: Slide[][] = [];
  let batch: Slide[] = [], bytes = 0;
  for (const slide of slides) {
    const size = slideBytes(slide);
    if (size > MAX_BATCH_BYTES) throw Error(`Slide ${slide.number} is too large to send. Try a PDF export or reduce its pictures.`);
    if (batch.length && (batch.length >= (mode === 'explain' ? 1 : 4) || bytes + size > MAX_BATCH_BYTES)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(slide);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
