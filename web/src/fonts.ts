// The app's three typefaces, self-hosted (bundled with the build) instead of
// loaded from Google Fonts at runtime: they render the same on every device,
// never flash in late, and keep working offline in the installed app.
// Gloock has a single weight (400); Instrument Sans and JetBrains Mono are
// variable fonts, so every weight the CSS asks for is a real cut.
import '@fontsource/gloock/400.css'
import '@fontsource-variable/instrument-sans/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
