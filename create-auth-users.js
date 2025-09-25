// Script to create auth users in Supabase
// Run this with: node create-auth-users.js
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
    password: 'password123',
    user_metadata: {
      first_name: 'Alex',
      last_name: 'Chen',
      full_name: 'Alex Chen'
    }
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'sarah.j@marketing.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Sarah',
      last_name: 'Johnson',
      full_name: 'Sarah Johnson'
    }
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'marcus.r@tech.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Marcus',
      last_name: 'Rodriguez',
      full_name: 'Marcus Rodriguez'
    }
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'emma.t@product.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Emma',
      last_name: 'Thompson',
      full_name: 'Emma Thompson'
    }
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    email: 'david.k@data.com',
    password: 'password123',
    user_metadata: {
      first_name: 'David',
      last_name: 'Kim',
      full_name: 'David Kim'
    }
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    email: 'zoe.m@design.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Zoe',
      last_name: 'Martinez',
      full_name: 'Zoe Martinez'
    }
  },
  {
    id: '77777777-7777-7777-7777-777777777777',
    email: 'james.w@sales.com',
    password: 'password123',
    user_metadata: {
      first_name: 'James',
      last_name: 'Wilson',
      full_name: 'James Wilson'
    }
  },
  {
    id: '88888888-8888-8888-8888-888888888888',
    email: 'priya.p@devops.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Priya',
      last_name: 'Patel',
      full_name: 'Priya Patel'
    }
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    email: 'michael.b@business.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Michael',
      last_name: 'Brown',
      full_name: 'Michael Brown'
    }
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'lisa.g@mobile.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Lisa',
      last_name: 'Garcia',
      full_name: 'Lisa Garcia'
    }
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    email: 'ryan.o@content.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Ryan',
      last_name: 'O\'Connor',
      full_name: 'Ryan O\'Connor'
    }
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    email: 'amanda.l@finance.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Amanda',
      last_name: 'Lee',
      full_name: 'Amanda Lee'
    }
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    email: 'carlos.s@ops.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Carlos',
      last_name: 'Silva',
      full_name: 'Carlos Silva'
    }
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    email: 'nina.v@ai.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Nina',
      last_name: 'Volkov',
      full_name: 'Nina Volkov'
    }
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    email: 'tom.a@success.com',
    password: 'password123',
    user_metadata: {
      first_name: 'Tom',
      last_name: 'Anderson',
      full_name: 'Tom Anderson'
    }
  }
]

async function createUsers() {
  console.log('Creating auth users...')
  
  for (const user of users) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: user.password,
        user_metadata: user.user_metadata,
        email_confirm: true // Auto-confirm email
      })
      
      if (error) {
        console.error(`Error creating user ${user.email}:`, error.message)
      } else {
        console.log(`✅ Created user: ${user.email}`)
      }
    } catch (err) {
      console.error(`Error creating user ${user.email}:`, err.message)
    }
  }
  
  console.log('\n🎉 Auth user creation complete!')
  console.log('Now you can run the create-fake-users.sql script.')
}

createUsers()
