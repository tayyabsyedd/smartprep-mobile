/**
 * SmartPrep brand theme — sourced from the client's website,
 * https://startsmartfuture.com/ (Start Smart Future), extracted 2026-10-21.
 *
 * Evidence for the core values:
 * - primary #F5B332: the site's brand amber — dominant color of the
 *   official logo (32% of its pixels), the stroke of its check icons and
 *   the fill of its info-box ornaments (the site's own SVG files).
 * - ink #1A1A1A: the logo's text color family (#101010–#1B1B1B).
 * - heading #242424 / text #777777 / link #333333: the site theme's
 *   (Woodmart) text variables.
 * - surface #FAF7F4: off-white used in the site's ornament SVG.
 *
 * primaryDark is a derived shade (not on the site) for places that need
 * the brand color as readable text on white.
 *
 * The site's exact font families could not be read from public sources
 * (they live in the site's wp-admin Theme Settings → Typography) — the
 * app keeps the platform default font until the client confirms them.
 */
export const colors = {
  primary: '#F5B332',
  primaryDark: '#9C6D0B',
  onPrimary: '#1A1A1A',
  ink: '#1A1A1A',
  heading: '#242424',
  text: '#777777',
  link: '#333333',
  background: '#FFFFFF',
  surface: '#FAF7F4',
  success: '#1E7D32',
  danger: '#B3261E',
};
