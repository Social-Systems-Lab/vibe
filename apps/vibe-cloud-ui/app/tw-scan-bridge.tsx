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
  // Include representative classnames that vibe-react uses at runtime:
  // - display utilities and responsive variants
  // - directional border and color
  // - arbitrary color
  // - alignment
  return (
    <div className="hidden md:block md:flex justify-end border-r border-gray-200 bg-[#ff0000] bg-[#fbfbfb] h-[30px]" />
  );
}
