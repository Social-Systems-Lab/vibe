/**
 * Tailwind scan bridge:
 * This file is not imported anywhere. It exists solely to ensure the Tailwind v4 scanner
 * in this app sees the utility classes that are used by the vibe-react package so that
 * the corresponding CSS rules are generated in apps/vibe-cloud-ui/app/globals.css.
 *
 * If/when the scanner reliably picks up classes from ../../packages/vibe-react/dist, this
 * file can be deleted. For now it guarantees presence of key utilities that were missing.
 */

export default function _TailwindScanBridge() {
  // Include representative classnames that vibe-react uses at runtime.
  // Keep this list broad; duplicates are fine. Hidden elements are never rendered.
  return (
    <div className="hidden">
      {/* Baseline utilities used across vibe-react */}
      <div className="hidden md:block md:flex justify-end border-r border-gray-200 bg-[#ff0000] bg-[#fbfbfb] h-[30px] inline-block size-2 rounded-full bg-violet-500 mt-2 flex items-center gap-4 text-xs text-foreground/70 ml-auto text-foreground/60 text-amber-700 absolute inset-y-0 rounded-full bg-foreground/40 ring-2 ring-amber-400/40 relative h-2 w-full overflow-hidden rounded-full bg-foreground/10 bg-violet-600 text-white hover:bg-violet-600/90 shrink-0 relative inline-block absolute top-12 right-0 bg-white rounded-lg shadow-lg w-64 z-[1001] border border-gray-200 overflow-hidden p-3 flex items-center font-bold text-lg whitespace-nowrap p-1 w-full p-2.5 border-none bg-transparent cursor-pointer text-left text-base rounded-md hover:bg-gray-100 bg-transparent border-none p-0 cursor-pointer block mr-3 font-bold text-lg whitespace-nowrap fixed inset-0 z-[1000] pointer-events-none select-none absolute inset-0 bg-background/60 backdrop-blur-sm z-0 px-6 py-4 rounded-md bg-background/70 text-foreground text-base font-medium shadow-sm" />

      {/* Global drop overlay surface (centered dashed rectangle) */}
      <div className="absolute inset-4 z-10 rounded-lg border-2 border-dashed border-violet-500/70 flex items-center justify-center" />

      {/* Global drop overlay label (purple pill) */}
      <div className="px-4 py-2 rounded-full bg-violet-600 text-white text-sm md:text-base font-medium shadow-sm" />

      {/* Additional helpers to ensure scanner catches everything used by the overlay */}
      <div className="fixed inset-0 z-[1000] pointer-events-none select-none" />
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-0" />
      <div className="flex items-center justify-center" />
    </div>
  );
}
