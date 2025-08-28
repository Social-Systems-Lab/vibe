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
      {/* ImagePicker and Dialog representative classes */}
      <div className="max-w-[720px] space-y-3 grid gap-3 grid-cols-3 col-span-full" />
      <div className="rounded-md border border-dashed p-6 text-center mb-3 text-sm text-muted-foreground inline-block mt-4 text-xs" />
      <div className="flex justify-end gap-2" />
      {/* Dialog overlay/content data-state variants */}
      <div className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <div className="data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] bg-background rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg max-w-[calc(100%-2rem)]" />
      {/* Button variants */}
      <div className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium shadow-xs bg-primary text-primary-foreground hover:bg-primary/90" />
      <div className="border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground" />
      <div className="bg-secondary text-secondary-foreground hover:bg-secondary/80" />
      {/* Selection rings and borders */}
      <div className="ring-2 ring-primary border border-transparent hover:border-border" />

      {/* Group hover + opacity transitions (used for hover camera overlays) */}
      <div className="group relative">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Pills and theme tokens used by overlays */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 border border-border shadow-sm text-sm" />

      {/* Focus-visible ring tokens used by dialog/buttons */}
      <div className="focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring outline-none" />

      <div className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4" />

      <div className="border rounded-md px-2 py-1.5 bg-background" />
    </div>
  );
}
