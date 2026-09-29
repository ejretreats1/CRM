import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

/**
 * Signature pad that survives viewport resizes.
 *
 * react-signature-canvas clears the canvas on every window `resize` by
 * default. iOS Safari fires `resize` whenever its address bar collapses or
 * expands while the page scrolls, so a signature drawn on a phone could be
 * wiped between drawing and pressing Submit (and mid-stroke, leaving only a
 * dot). This wrapper turns that off and instead re-sizes the canvas for the
 * new dimensions and redraws the captured strokes.
 */

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  clear: () => void;
  toDataURL: (type?: string) => string;
  getTrimmedCanvas: () => HTMLCanvasElement;
  getCanvas: () => HTMLCanvasElement;
}

interface Props {
  penColor?: string;
  backgroundColor?: string;
  className?: string;
  style?: React.CSSProperties;
  onEnd?: () => void;
}

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { penColor = '#1e293b', backgroundColor, className, style, onEnd },
  ref,
) {
  const padRef = useRef<SignatureCanvas>(null);

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    clear: () => padRef.current?.clear(),
    toDataURL: (type?: string) => padRef.current?.toDataURL(type) ?? '',
    getTrimmedCanvas: () => padRef.current!.getTrimmedCanvas(),
    getCanvas: () => padRef.current!.getCanvas(),
  }), []);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    const canvas = pad.getCanvas();
    let lastW = canvas.offsetWidth;
    let lastH = canvas.offsetHeight;

    const observer = new ResizeObserver(() => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h || (w === lastW && h === lastH)) return;
      lastW = w;
      lastH = h;
      // Keep what was drawn (points are stored in CSS pixels), re-size the
      // backing store for the new dimensions, then redraw.
      const strokes = pad.toData();
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.getContext('2d')?.scale(dpr, dpr);
      pad.clear();
      if (strokes.length) pad.fromData(strokes);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <SignatureCanvas
      ref={padRef}
      penColor={penColor}
      // Only pass these when set: react-signature-canvas copies every prop
      // onto the pad on each update, and an explicit `undefined`
      // backgroundColor makes clear() paint the canvas with the pen color.
      {...(backgroundColor !== undefined ? { backgroundColor } : {})}
      {...(onEnd ? { onEnd } : {})}
      clearOnResize={false}
      canvasProps={{
        className,
        style: { display: 'block', width: '100%', touchAction: 'none', ...style },
      }}
    />
  );
});

export default SignaturePad;
