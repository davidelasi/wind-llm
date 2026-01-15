// Test path resolution for training examples
const path = require('path');
const fs = require('fs').promises;

async function testPaths() {
  console.log('Current working directory:', process.cwd());

  const currentDate = new Date();
  const month = currentDate.toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'America/Los_Angeles'
  }).toLowerCase();

  const pacificHour = parseInt(currentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/Los_Angeles'
  }).split(':')[0]);

  let forecastNumber = 1;
  if (pacificHour >= 6 && pacificHour < 14) forecastNumber = 1;
  else if (pacificHour >= 14 && pacificHour < 20) forecastNumber = 2;
  else forecastNumber = 3;

  console.log(`Month: ${month}, Forecast Number: ${forecastNumber}`);

  // Test path 1: web-ui data directory (should work)
  const jsonDirectory = path.join(
    process.cwd(),
    'data',
    'training',
    'few_shot_examples'
  );

  let jsonPath = path.join(jsonDirectory, `${month}_fc${forecastNumber}_examples.json`);
  console.log('\nPath 1 (primary):', jsonPath);

  try {
    await fs.access(jsonPath);
    console.log('✓ Path 1 EXISTS');
    const content = await fs.readFile(jsonPath, 'utf-8');
    const examples = JSON.parse(content);
    console.log(`  Loaded ${examples.length} examples`);
  } catch (error) {
    console.log('✗ Path 1 FAILED:', error.message);

    // Test path 2: parent directory with archive
    const parentJsonPath = path.join(
      process.cwd(),
      '..',
      'data',
      'training',
      'archive',
      'few_shot_examples',
      `${month}_fc${forecastNumber}_examples.json`
    );

    console.log('\nPath 2 (fallback):', parentJsonPath);

    try {
      await fs.access(parentJsonPath);
      console.log('✓ Path 2 EXISTS');
    } catch (error2) {
      console.log('✗ Path 2 FAILED:', error2.message);
    }
  }
}

testPaths().catch(console.error);
