// Test script to diagnose LLM forecast API issues
const fs = require('fs/promises');
const path = require('path');

async function testComponents() {
  console.log('=== Testing LLM Forecast API Components ===\n');

  // 1. Test model config loading
  console.log('1. Testing model config loading...');
  try {
    const configPath = path.join(__dirname, '..', 'config', 'model_config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    console.log('✓ Model config loaded successfully');
    console.log('  Model:', config.model);
    console.log('  Temperature:', config.temperature);
  } catch (error) {
    console.log('✗ Model config loading failed:', error.message);
  }

  // 2. Test training examples loading
  console.log('\n2. Testing training examples loading...');
  try {
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

    const jsonPath = path.join(
      __dirname,
      'data',
      'training',
      'few_shot_examples',
      `${month}_fc${forecastNumber}_examples.json`
    );

    console.log('  Looking for:', jsonPath);
    const fileContent = await fs.readFile(jsonPath, 'utf-8');
    const examples = JSON.parse(fileContent);
    console.log('✓ Training examples loaded successfully');
    console.log('  Month:', month);
    console.log('  Forecast number:', forecastNumber);
    console.log('  Examples count:', examples.length);
  } catch (error) {
    console.log('✗ Training examples loading failed:', error.message);
  }

  // 3. Test Anthropic API key
  console.log('\n3. Testing Anthropic API key...');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    console.log('✓ ANTHROPIC_API_KEY is set');
    console.log('  Key starts with:', apiKey.substring(0, 15) + '...');
  } else {
    console.log('✗ ANTHROPIC_API_KEY is not set');
  }

  // 4. Test NWS API
  console.log('\n4. Testing NWS API access...');
  try {
    const response = await fetch('https://api.weather.gov/products/types/CWF/locations/LOX');
    if (response.ok) {
      const data = await response.json();
      console.log('✓ NWS API accessible');
      console.log('  Available forecasts:', data['@graph']?.length || 0);
    } else {
      console.log('✗ NWS API returned status:', response.status);
    }
  } catch (error) {
    console.log('✗ NWS API access failed:', error.message);
  }
}

testComponents().catch(console.error);
