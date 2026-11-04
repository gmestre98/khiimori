// The app's three typefaces ("Travel journal"), self-hosted (bundled with the
// build) instead of loaded from a font service at runtime: they render the same
// on every device, never flash in late, and keep working offline in the
// installed app.
// - Newsreader (variable, with optical sizes): titles, day numbers, money.
// - Public Sans (variable, roman + italic): everything you read and tap.
// - IBM Plex Mono (400, 500): labels, times, tags.
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/public-sans/wght.css'
import '@fontsource-variable/public-sans/wght-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
