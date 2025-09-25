#!/usr/bin/env node

// Test script for marking a match as met
import fetch from 'node-fetch';

async function testMarkMatchMet() {
  console.log('🧪 Testing Mark Match as Met\n');

  // This would be called when a user marks a match as met
  console.log('1️⃣ Simulating user marking a match as met...');
  
  try {
    const response = await fetch('http://localhost:3000/api/mark-match-met', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        matchId: 'test-match-id',
        userId: 'test-user-id',
        eventId: '49911d40-19fd-4add-8c7c-8e1668421715' // FRESH event ID
      })
    });

    const result = await response.json();
    console.log('✅ Mark match as met result:', result);
  } catch (error) {
    console.log('❌ Mark match as met error:', error.message);
  }

  console.log('\n2️⃣ Testing smart refresh for specific user...');
  
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
    console.log('✅ Smart refresh result:', result);
  } catch (error) {
    console.log('❌ Smart refresh error:', error.message);
  }
}

// Run the test
testMarkMatchMet().catch(console.error);
