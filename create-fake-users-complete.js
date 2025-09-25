// Complete script to create fake users with auth + profiles
// This script creates both auth users and their profiles in the correct order
// Run with: node create-fake-users-complete.js

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
    profile: {
      first_name: 'Alex',
      last_name: 'Chen',
      job_title: 'Founder & CEO',
      company: 'TechFlow',
      what_do_you_do: 'Building the future of remote work',
      mbti: 'ENTJ',
      enneagram: '8w7',
      networking_goals: ['business-opportunities', 'clients']
    }
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'sarah.j@marketing.com',
    password: 'password123',
    profile: {
      first_name: 'Sarah',
      last_name: 'Johnson',
      job_title: 'Marketing Director',
      company: 'GrowthCo',
      what_do_you_do: 'Scaling brands through digital marketing',
      mbti: 'ENFP',
      enneagram: '2w3',
      networking_goals: ['career-mentorship', 'friends-connections']
    }
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'marcus.r@tech.com',
    password: 'password123',
    profile: {
      first_name: 'Marcus',
      last_name: 'Rodriguez',
      job_title: 'Senior Software Engineer',
      company: 'BigTech Inc',
      what_do_you_do: 'Building scalable backend systems',
      mbti: 'INTJ',
      enneagram: '5w4',
      networking_goals: ['career-mentorship', 'business-opportunities']
    }
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'emma.t@product.com',
    password: 'password123',
    profile: {
      first_name: 'Emma',
      last_name: 'Thompson',
      job_title: 'Product Manager',
      company: 'InnovateCorp',
      what_do_you_do: 'Leading product strategy and user experience',
      mbti: 'ENFJ',
      enneagram: '2w1',
      networking_goals: ['career-mentorship', 'clients']
    }
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    email: 'david.k@data.com',
    password: 'password123',
    profile: {
      first_name: 'David',
      last_name: 'Kim',
      job_title: 'Data Scientist',
      company: 'AnalyticsPro',
      what_do_you_do: 'Turning data into actionable insights',
      mbti: 'INTP',
      enneagram: '5w6',
      networking_goals: ['business-opportunities', 'friends-connections']
    }
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    email: 'zoe.m@design.com',
    password: 'password123',
    profile: {
      first_name: 'Zoe',
      last_name: 'Martinez',
      job_title: 'UX Designer',
      company: 'CreativeStudio',
      what_do_you_do: 'Creating beautiful and functional user experiences',
      mbti: 'ISFP',
      enneagram: '4w5',
      networking_goals: ['friends-connections', 'career-mentorship']
    }
  },
  {
    id: '77777777-7777-7777-7777-777777777777',
    email: 'james.w@sales.com',
    password: 'password123',
    profile: {
      first_name: 'James',
      last_name: 'Wilson',
      job_title: 'Sales Director',
      company: 'RevenueMax',
      what_do_you_do: 'Building relationships and closing deals',
      mbti: 'ESTJ',
      enneagram: '3w2',
      networking_goals: ['clients', 'business-opportunities']
    }
  },
  {
    id: '88888888-8888-8888-8888-888888888888',
    email: 'priya.p@devops.com',
    password: 'password123',
    profile: {
      first_name: 'Priya',
      last_name: 'Patel',
      job_title: 'DevOps Engineer',
      company: 'CloudTech',
      what_do_you_do: 'Automating infrastructure and deployment',
      mbti: 'ISTJ',
      enneagram: '1w9',
      networking_goals: ['career-mentorship', 'friends-connections']
    }
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    email: 'michael.b@business.com',
    password: 'password123',
    profile: {
      first_name: 'Michael',
      last_name: 'Brown',
      job_title: 'Business Analyst',
      company: 'StrategyCorp',
      what_do_you_do: 'Analyzing business processes and improving efficiency',
      mbti: 'ENTP',
      enneagram: '7w8',
      networking_goals: ['business-opportunities', 'career-mentorship']
    }
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'lisa.g@mobile.com',
    password: 'password123',
    profile: {
      first_name: 'Lisa',
      last_name: 'Garcia',
      job_title: 'Mobile Developer',
      company: 'AppWorks',
      what_do_you_do: 'Building native iOS and Android apps',
      mbti: 'ISFJ',
      enneagram: '6w5',
      networking_goals: ['friends-connections', 'career-mentorship']
    }
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    email: 'ryan.o@content.com',
    password: 'password123',
    profile: {
      first_name: 'Ryan',
      last_name: 'O\'Connor',
      job_title: 'Content Creator',
      company: 'MediaHouse',
      what_do_you_do: 'Creating engaging content for tech brands',
      mbti: 'ESFP',
      enneagram: '7w6',
      networking_goals: ['clients', 'friends-connections']
    }
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    email: 'amanda.l@finance.com',
    password: 'password123',
    profile: {
      first_name: 'Amanda',
      last_name: 'Lee',
      job_title: 'Financial Analyst',
      company: 'FinanceFirst',
      what_do_you_do: 'Analyzing market trends and investment opportunities',
      mbti: 'INTJ',
      enneagram: '5w4',
      networking_goals: ['business-opportunities', 'career-mentorship']
    }
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    email: 'carlos.s@ops.com',
    password: 'password123',
    profile: {
      first_name: 'Carlos',
      last_name: 'Silva',
      job_title: 'Operations Manager',
      company: 'EfficiencyCorp',
      what_do_you_do: 'Streamlining operations and improving processes',
      mbti: 'ESTP',
      enneagram: '8w7',
      networking_goals: ['business-opportunities', 'clients']
    }
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    email: 'nina.v@ai.com',
    password: 'password123',
    profile: {
      first_name: 'Nina',
      last_name: 'Volkov',
      job_title: 'AI Researcher',
      company: 'AI Labs',
      what_do_you_do: 'Advancing artificial intelligence research',
      mbti: 'INFP',
      enneagram: '4w3',
      networking_goals: ['career-mentorship', 'business-opportunities']
    }
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    email: 'tom.a@success.com',
    password: 'password123',
    profile: {
      first_name: 'Tom',
      last_name: 'Anderson',
      job_title: 'Customer Success Manager',
      company: 'SaaS Solutions',
      what_do_you_do: 'Ensuring customer satisfaction and retention',
      mbti: 'ESFJ',
      enneagram: '2w3',
      networking_goals: ['friends-connections', 'clients']
    }
  }
]

async function createUsers() {
  console.log('🚀 Starting to create fake users...')
  
  // First, create auth users
  console.log('\n📝 Creating auth users...')
  for (const user of users) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: user.password,
        user_metadata: {
          first_name: user.profile.first_name,
          last_name: user.profile.last_name,
          full_name: `${user.profile.first_name} ${user.profile.last_name}`
        },
        email_confirm: true
      })
      
      if (error) {
        console.error(`❌ Error creating auth user ${user.email}:`, error.message)
      } else {
        console.log(`✅ Created auth user: ${user.email}`)
      }
    } catch (err) {
      console.error(`❌ Error creating auth user ${user.email}:`, err.message)
    }
  }
  
  // Wait a moment for auth users to be fully created
  console.log('\n⏳ Waiting for auth users to be fully created...')
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Now create profiles
  console.log('\n👤 Creating profiles...')
  for (const user of users) {
    try {
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          first_name: user.profile.first_name,
          last_name: user.profile.last_name,
          email: user.email,
          job_title: user.profile.job_title,
          company: user.profile.company,
          what_do_you_do: user.profile.what_do_you_do,
          mbti: user.profile.mbti,
          enneagram: user.profile.enneagram,
          networking_goals: user.profile.networking_goals,
          consent: true
        })
      
      if (error) {
        console.error(`❌ Error creating profile for ${user.email}:`, error.message)
      } else {
        console.log(`✅ Created profile: ${user.profile.first_name} ${user.profile.last_name}`)
      }
    } catch (err) {
      console.error(`❌ Error creating profile for ${user.email}:`, err.message)
    }
  }
  
  console.log('\n🎉 User creation complete!')
  console.log('Now run the create-fake-users.sql script to add hobbies, expertise, and event data.')
}

createUsers()
