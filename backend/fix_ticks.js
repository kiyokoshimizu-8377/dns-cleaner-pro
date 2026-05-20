const fs = require('fs');

const files = [
  'src/auto-onboarding/auto-onboarding.processor.ts',
  'src/auto-onboarding/auto-onboarding.service.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  // Replace escaped backticks `\`` with just `` ` ``
  content = content.replace(/\\`/g, '`');
  fs.writeFileSync(file, content);
}
