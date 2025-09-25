#!/usr/bin/env node

// Test script for smart refresh system
import fetch from 'node-fetch';

async function testSmartRefresh() {
  console.log('🧪 Testing Smart Refresh System\n');

  // Test 1: Periodic refresh (no specific user)
  console.log('1️⃣ Testing periodic refresh...');
  try {
    const response = await fetch('http://localhost:3000/api/smart-refresh-matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventCode: 'FRESH',
        reason: 'test_periodic_refresh'
      })
    });

    const result = await response.json();
    console.log('✅ Periodic refresh result:', result);
  } catch (error) {
    console.log('❌ Periodic refresh error:', error.message);
  }

  console.log('\n2️⃣ Testing user-specific refresh...');
  try {
    const response = await fetch('http://localhost:3000/api/smart-refresh-matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventCode: 'FRESH',
        userId: 'test-user-id',
        reason: 'user_met_match'
      })
    });

    const result = await response.json();
    console.log('✅ User-specific refresh result:', result);
  } catch (error) {
    console.log('❌ User-specific refresh error:', error.message);
  }

  console.log('\n3️⃣ Testing cron endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/cron-refresh-matches', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer your-cron-secret'
      }
    });

    const result = await response.json();
    console.log('✅ Cron job result:', result);
  } catch (error) {
    console.log('❌ Cron job error:', error.message);
  }
}

// Run the test
testSmartRefresh().catch(console.error);
