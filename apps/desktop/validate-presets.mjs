import fs from 'fs';

const presets = JSON.parse(fs.readFileSync('C:\\browser-user\\apps\\desktop\\src-tauri\\sidecar\\docs\\launch\\source\\presets.json', 'utf-8'));
const userPrefs = JSON.parse(fs.readFileSync('C:\\browser-user\\apps\\desktop\\src-tauri\\sidecar\\docs\\launch\\source\\user-prefs.json', 'utf-8'));

// Validate presets structure
const presetNames = Object.keys(presets);
console.log('Presets:', presetNames);

// Check each preset has required fields
const requiredPresetFields = ['name', 'description', 'preset', 'rffmpeg', 'fri', 'font-opt', 'markers', 'output'];
for (const name of presetNames) {
  const preset = presets[name];
  const hasRequired = requiredPresetFields.every(k => k in preset);
  console.log(name, 'has required fields:', hasRequired, 'fields:', Object.keys(preset));
}

// Validate userPrefs structure
console.log('userPrefs qualityMode:', userPrefs.qualityMode);
console.log('userPrefs outputFormat:', userPrefs.outputFormat);
console.log('userPrefs selectedPreset:', userPrefs.selectedPreset);
console.log('Has presetPreferences:', !!userPrefs.presetPreferences);

// Validate preset preferences exist
if (userPrefs.presetPreferences) {
  const pNames = Object.keys(userPrefs.presetPreferences);
  console.log('Preset preferences keys:', pNames);
  for (const pName of pNames) {
    const pref = userPrefs.presetPreferences[pName];
    console.log(pName, 'has useCount:', 'useCount' in pref, 'useCount:', pref.useCount);
  }
}

console.log('\nAll validations passed!');