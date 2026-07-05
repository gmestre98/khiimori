// Shared journal metadata vocabulary — the weather / mood option lists and their
// display glyphs. Kept in its own module (not JournalEditor) so both the editor
// and the trip Journal subtab's travelogue can import them without tripping the
// react-refresh "components only" rule.

export const WEATHER_OPTIONS = ['', 'sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'stormy', 'foggy']
export const MOOD_OPTIONS = ['', 'great', 'good', 'okay', 'tired', 'stressed', 'sad']

export const WEATHER_LABELS: Record<string, string> = {
  '': '—',
  sunny: '☀️ Sunny',
  cloudy: '☁️ Cloudy',
  rainy: '🌧️ Rainy',
  snowy: '❄️ Snowy',
  windy: '💨 Windy',
  stormy: '⛈️ Stormy',
  foggy: '🌫️ Foggy',
}

export const MOOD_LABELS: Record<string, string> = {
  '': '—',
  great: '😄 Great',
  good: '🙂 Good',
  okay: '😐 Okay',
  tired: '😴 Tired',
  stressed: '😤 Stressed',
  sad: '😢 Sad',
}
