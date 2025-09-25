// Script to update display names for auth users
// Run this with: node update-auth-display-names.js
// Make sure to set your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js')

// You need to set these environment variables or replace with your values
const supabaseUrl = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const users = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'alex.chen@startup.com',
    display_name: 'Alex Chen'
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'sarah.j@marketing.com',
    display_name: 'Sarah Johnson'
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'marcus.r@tech.com',
    display_name: 'Marcus Rodriguez'
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'emma.t@product.com',
    display_name: 'Emma Thompson'
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    email: 'david.k@data.com',
    display_name: 'David Kim'
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    email: 'zoe.m@design.com',
    display_name: 'Zoe Martinez'
  },
  {
    id: '77777777-7777-7777-7777-777777777777',
    email: 'james.w@sales.com',
    display_name: 'James Wilson'
  },
  {
    id: '88888888-8888-8888-8888-888888888888',
    email: 'priya.p@devops.com',
    display_name: 'Priya Patel'
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    email: 'michael.b@business.com',
    display_name: 'Michael Brown'
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'lisa.g@mobile.com',
    display_name: 'Lisa Garcia'
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    email: 'ryan.o@content.com',
    display_name: 'Ryan O\'Connor'
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    email: 'amanda.l@finance.com',
    display_name: 'Amanda Lee'
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    email: 'carlos.s@ops.com',
    display_name: 'Carlos Silva'
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    email: 'nina.v@ai.com',
    display_name: 'Nina Volkov'
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    email: 'tom.a@success.com',
    display_name: 'Tom Anderson'
  }
]

async function updateDisplayNames() {
  console.log('🚀 Starting to update display names for auth users...')
  
  for (const user of users) {
    try {
      const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          full_name: user.display_name,
          first_name: user.display_name.split(' ')[0],
          last_name: user.display_name.split(' ').slice(1).join(' ')
        }
      })
      
      if (error) {
        console.error(`❌ Error updating ${user.email}:`, error.message)
      } else {
        console.log(`✅ Updated display name: ${user.display_name}`)
      }
    } catch (err) {
      console.error(`❌ Error updating ${user.email}:`, err.message)
    }
  }
  
  console.log('\n🎉 Display name updates complete!')
  console.log('Now run the create-all-fake-users.sql script to add profiles, hobbies, expertise, and event data.')
}

updateDisplayNames()
