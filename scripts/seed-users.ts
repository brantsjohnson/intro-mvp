#!/usr/bin/env node

/**
 * Seed script to generate 15 sample users in Supabase
 * 
 * Each user will have:
 * - Full profile with all fields filled out
 * - 1-5 randomly selected connection types
 * - Follow-up questions answered (1-3 sentences each)
 * - AI questionnaire completed (3-4 multiple-choice questions)
 * 
 * Usage:
 *   npm run seed:users
 *   npm run wipe:all
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import OpenAI from 'openai'
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: join(__dirname, '..', '.env.local') })

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
console.log(`\n🔗 Supabase URL: ${supabaseUrl}`)

// Initialize OpenAI if available (optional for embeddings and personality)
const openaiApiKey = process.env.OPENAI_API_KEY
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null
if (openai) {
  console.log('✅ OpenAI API key found - will generate embeddings and personality data')
} else {
  console.log('⚠️  No OpenAI API key found - will generate mock embeddings and personality data')
}

// Connection type options (database format)
const CONNECTION_TYPES = [
  'general',
  'biz_opps',
  'find_mentor',
  'be_mentor',
  'find_job',
  'recruit',
  'other'
]

// Follow-up question templates
const FOLLOW_UP_QUESTIONS: Record<string, string[]> = {
  find_mentor: [
    "I'm looking for guidance on transitioning into product management from engineering. I'd love to learn about product strategy, user research, and how to think about building features that users actually want.",
    "Seeking a mentor who can help me navigate the startup world and fundraising. I'm a first-time founder and would appreciate insights on building relationships with investors and scaling my team.",
    "I want to find someone who can mentor me in data science and machine learning. I'm particularly interested in learning about production ML systems and best practices for deploying models."
  ],
  be_mentor: [
    "I've worked in fintech for 8 years, focusing on payment systems and fraud detection. I also have experience in product management and can help with career transitions or technical challenges.",
    "I've been in the healthcare tech space for 12 years, working on both clinical systems and consumer health apps. I'm happy to mentor folks interested in healthcare, product development, or engineering leadership.",
    "I have experience in both startups and enterprise companies, having worked at Google and several Series A startups. I can help with engineering architecture, team building, and navigating career decisions."
  ],
  biz_opps: [
    "I'm looking for potential partnerships or collaborations. My company builds developer tools and we're always interested in integrating with other platforms or finding co-marketing opportunities.",
    "I'm seeking business opportunities in the B2B SaaS space. We're particularly interested in partnerships with companies that serve SMBs or have complementary products to ours.",
    "Looking to connect with potential clients or partners. We offer consulting services in AI and machine learning, and we're always open to discussing how we can help other companies."
  ],
  general: [
    "I love hiking, reading science fiction, and trying new restaurants. I'm also into photography and enjoy capturing street scenes in my free time.",
    "I'm passionate about travel, cooking, and learning new languages. I've been studying Spanish and recently started learning Portuguese. I also enjoy board games and hosting game nights.",
    "I enjoy rock climbing, playing guitar, and attending tech meetups. I'm always interested in learning about new technologies and meeting people who share similar interests."
  ],
  other: [
    "My main goal is to explore new career opportunities and understand different industries. I'm particularly curious about how different companies approach product development and team culture.",
    "I'm looking to expand my network and learn from people with diverse backgrounds. I believe in the power of connecting with others and sharing knowledge and experiences.",
    "I want to understand different career paths and industries better. I'm at a point where I'm considering my next move and would love to hear about other people's journeys."
  ],
  find_job: [
    "I'm looking for a senior software engineering role, preferably in a product-focused company. I'm interested in full-stack development with a focus on user experience and performance.",
    "I'm seeking a product management position at a startup or growth-stage company. I have experience in B2B SaaS and I'm particularly interested in developer tools or AI products.",
    "I'm looking for a data science role where I can work on challenging problems. I'm interested in machine learning, NLP, and building production systems that make an impact."
  ],
  recruit: [
    "We're actively hiring for senior engineers, product managers, and designers. We're a Series B startup building developer tools and looking for folks who are passionate about developer experience.",
    "I'm recruiting for our engineering team. We're looking for full-stack developers with experience in React, Node.js, and cloud infrastructure. We're a fast-growing fintech company.",
    "We're hiring across multiple roles including engineering, product, and sales. We're a healthcare tech company focused on improving patient outcomes through better technology."
  ]
}

// Sample job titles
const JOB_TITLES = [
  'Software Engineer',
  'Product Manager',
  'Data Scientist',
  'Designer',
  'Engineering Manager',
  'Marketing Director',
  'Sales Manager',
  'Founder',
  'CTO',
  'VP of Product',
  'Business Analyst',
  'UX Researcher',
  'DevOps Engineer',
  'Full Stack Developer',
  'Machine Learning Engineer'
]

// Sample companies
const COMPANIES = [
  'TechCorp',
  'StartupXYZ',
  'InnovateLab',
  'DataFlow',
  'CloudScale',
  'ProductForge',
  'DesignStudio',
  'CodeBase',
  'FutureTech',
  'DigitalWorks',
  'SmartSolutions',
  'NextGen',
  'Velocity',
  'Apex',
  'Zenith'
]

// Sample expertise areas
const EXPERTISE_AREAS = [
  'Machine Learning, Python, Data Analysis',
  'React, Node.js, Full Stack Development',
  'Product Strategy, User Research, Design Thinking',
  'Cloud Infrastructure, AWS, DevOps',
  'UI/UX Design, Figma, Design Systems',
  'Sales, Business Development, Partnerships',
  'Marketing, Growth, Content Strategy',
  'Mobile Development, iOS, Swift',
  'Backend Systems, APIs, Microservices',
  'AI/ML, Natural Language Processing',
  'E-commerce, Payment Systems, Fintech',
  'Healthcare Tech, Clinical Systems',
  'Developer Tools, Developer Experience',
  'Cybersecurity, Security Engineering',
  'Blockchain, Web3, Cryptocurrency'
]

// Sample hobbies
const HOBBIES = [
  ['hiking', 'photography', 'reading'],
  ['cooking', 'travel', 'board games'],
  ['rock climbing', 'guitar', 'tech meetups'],
  ['yoga', 'writing', 'coffee'],
  ['cycling', 'podcasting', 'film'],
  ['gardening', 'painting', 'music'],
  ['running', 'volunteering', 'languages'],
  ['gaming', '3D printing', 'electronics'],
  ['sailing', 'scuba diving', 'travel'],
  ['dancing', 'theater', 'improv']
]

// Sample first names
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Sam', 'Taylor', 'Casey',
  'Morgan', 'Riley', 'Avery', 'Quinn', 'Blake',
  'Sage', 'River', 'Phoenix', 'Sky', 'Emery'
]

// Sample last names
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones',
  'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas'
]

// Sample why attending responses
const WHY_ATTENDING = [
  "I'm excited to meet other professionals in the tech industry and learn about new trends and opportunities. I'm particularly interested in connecting with people working on AI and machine learning.",
  "I'm attending to expand my network and find potential collaborators or partners. I'm building a startup and looking for people who share similar interests and goals.",
  "I want to learn from others' experiences and share my own insights. I believe in the power of community and helping each other grow professionally.",
  "I'm here to explore new career opportunities and understand different companies and industries. I'm at a point where I'm considering my next move.",
  "I'm attending to find mentors and people I can learn from. I'm early in my career and value the opportunity to connect with experienced professionals.",
  "I'm looking to recruit talented people for my team. We're growing fast and always looking for great engineers, designers, and product managers.",
  "I'm here to meet potential clients and partners. We offer consulting services and I'm always open to discussing how we can help other companies.",
  "I want to connect with like-minded people and build meaningful relationships. I believe networking is about quality connections, not quantity."
]

// Sample business need responses
const BUSINESS_NEEDS = [
  "We're looking for partnerships with companies that can help us reach new markets. We're particularly interested in co-marketing opportunities and integrations.",
  "We need help with scaling our infrastructure. We're growing fast and looking for solutions or partners who can help us handle increased traffic.",
  "We're seeking talent - we're hiring engineers, designers, and product managers. We're looking for people who are passionate about what we're building.",
  "We're looking for potential investors or advisors. We're a seed-stage startup and would love to connect with people who can help us grow.",
  "We need help with customer acquisition. We're looking for partnerships or strategies that can help us reach more potential customers.",
  "We're seeking technical expertise in specific areas. We're working on some challenging problems and would benefit from external perspectives.",
  "We're looking for beta users or early adopters. We're building a new product and want to get feedback from people who might benefit from it.",
  "We need help with marketing and growth. We have a great product but need help getting the word out and reaching our target audience."
]

// Sample AI questionnaire questions and options (from the question engine)
const AI_QUESTIONS = [
  {
    id: 'q1',
    text: 'How do you approach challenges?',
    options: [
      { key: 'A', label: 'Plan carefully' },
      { key: 'B', label: 'Jump in quickly' },
      { key: 'C', label: 'Get team input' }
    ]
  },
  {
    id: 'q2',
    text: 'When working, you prefer:',
    options: [
      { key: 'A', label: 'Solo deep focus' },
      { key: 'B', label: 'Collaborative teams' },
      { key: 'C', label: 'Mix of both' }
    ]
  },
  {
    id: 'q3',
    text: 'What energizes you most?',
    options: [
      { key: 'A', label: 'Solving problems' },
      { key: 'B', label: 'Working with people' },
      { key: 'C', label: 'Creating new things' }
    ]
  },
  {
    id: 'q4',
    text: 'When stuck, you:',
    options: [
      { key: 'A', label: 'Step back and think' },
      { key: 'B', label: 'Ask for help' },
      { key: 'C', label: 'Try new approaches' }
    ]
  }
]

// Years of experience options
const EXPERIENCE_RANGES = [
  '0-1 years',
  '2-5 years',
  '6-10 years',
  '11-15 years',
  '16-20 years',
  '21+ years'
]

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

function randomChoices<T>(array: T[], min: number, max: number): T[] {
  const count = randomInt(min, max)
  const shuffled = [...array].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}

function generateUserId(): string {
  // Generate a UUID-like string for user_id
  return randomBytes(16).toString('hex')
}

function generateEmail(firstName: string, lastName: string): string {
  const domain = 'seed-example.com'
  const randomNum = randomInt(1000, 9999)
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${randomNum}@${domain}`
}

function parseYearsExperience(range: string): number {
  if (range.includes('+')) return 21
  const parts = range.split('-')
  if (parts.length === 2) {
    return Math.floor((parseInt(parts[0]) + parseInt(parts[1])) / 2)
  }
  return 5
}

async function getOrCreateEvent(): Promise<string> {
  // Try to get an existing event
  const { data: existingEvents, error: fetchError } = await supabase
    .from('events')
    .select('event_id')
    .limit(1)

  if (existingEvents && existingEvents.length > 0) {
    return existingEvents[0].event_id
  }

  // Create a new event if none exists
  const eventCode = 'SEED' + randomInt(1000, 9999).toString()
  const { data: newEvent, error: createError } = await supabase
    .from('events')
    .insert({
      event_code: eventCode,
      event_name: 'Seed Event - Testing',
      event_location: 'Virtual',
      event_starts_at: new Date().toISOString(),
      event_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
    .select('event_id')
    .single()

  if (createError || !newEvent) {
    throw new Error(`Failed to create event: ${createError?.message || 'Unknown error'}`)
  }

  console.log(`✅ Created new event: ${eventCode}`)
  return newEvent.event_id
}

// Generate embedding using OpenAI or return mock embedding
async function generateEmbedding(text: string): Promise<number[] | null> {
  if (openai && text) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      })
      return response.data[0]?.embedding || null
    } catch (error) {
      console.warn(`⚠️  Failed to generate embedding: ${error}`)
      // Fall through to mock embedding
    }
  }
  
  // Generate mock embedding (1536 dimensions for text-embedding-3-small)
  // Use a simple hash-based approach for deterministic but varied embeddings
  const mockEmbedding = new Array(1536).fill(0).map((_, i) => {
    const hash = (text.charCodeAt(i % text.length) + i) % 1000
    return (hash / 1000 - 0.5) * 0.1 // Small random values between -0.05 and 0.05
  })
  return mockEmbedding
}

// Generate personality data using OpenAI or return mock data
async function generatePersonalityData(params: {
  firstName: string
  lastName: string
  jobTitle: string
  company: string
  expertise: string
  hobbies: string[]
  whyAttending: string
  connectionTypes: string[]
  businessNeed: string
  adaptiveQnA: any
}): Promise<{
  mbti_type: string | null
  enneagram_type: string | null
  bigfive_scores: any | null
  personality_json: any | null
  communication_style: string | null
  personality_confidence: any | null
}> {
  const { firstName, lastName, jobTitle, company, expertise, hobbies, whyAttending, connectionTypes, businessNeed, adaptiveQnA } = params
  
  if (openai && adaptiveQnA?.asked && adaptiveQnA.asked.length > 0) {
    try {
      // Build Q&A history for analysis
      const qaHistory = adaptiveQnA.asked.map((qa: any, index: number) => {
        return `Q${index + 1}: ${qa.questionText || qa.qid}\nA${index + 1}: ${qa.choice || qa.answer}`
      }).join('\n\n')
      
      const userContext = `Name: ${firstName} ${lastName}
Job Title: ${jobTitle}
Company: ${company}
Why Attending: ${whyAttending}
Connection Types: ${connectionTypes.join(', ')}
Business Need: ${businessNeed}`
      
      const personalityPrompt = `You are a personality assessment expert. Analyze the following Q&A responses and infer personality types.

USER CONTEXT:
${userContext}

ADAPTIVE Q&A RESPONSES:
${qaHistory}

YOUR TASK:
Based on the answers, infer:
1. **MBTI Type** (e.g., "INTJ", "ENFP", "ISFJ") - one of the 16 types
2. **Enneagram Type** (1-9, optionally with wing like "5w4")
3. **Big Five Scores** (0-100 for each trait):
   - Openness (creativity, curiosity)
   - Conscientiousness (organization, discipline)
   - Extraversion (social energy, assertiveness)
   - Agreeableness (cooperation, trust)
   - Neuroticism (emotional stability)

Provide confidence scores (0-100) for each assessment.

OUTPUT FORMAT (STRICT JSON - no markdown, no code blocks):
{
  "mbti_type": "INTJ" or null,
  "mbti_confidence": 75,
  "enneagram_type": "5w4" or null,
  "enneagram_confidence": 70,
  "bigfive_scores": {
    "openness": 85,
    "conscientiousness": 60,
    "extraversion": 30,
    "agreeableness": 70,
    "neuroticism": 40
  },
  "bigfive_confidence": 75,
  "personality_json": {
    "summary": "Brief personality summary",
    "key_traits": ["trait1", "trait2"],
    "communication_style": "analytical" or "expressive" or "amiable" or "driver"
  }
}

If confidence is below 50, set the type to null. Only return data you're reasonably confident about.`

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: personalityPrompt }],
        temperature: 0.3,
        max_tokens: 500,
      })

      const text = response.choices[0]?.message?.content || ''
      
      // Clean up the response
      let cleanedText = text.trim()
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }

      try {
        const personalityData = JSON.parse(cleanedText)
        
        // Only save if confidence is reasonable
        if (personalityData.mbti_confidence && personalityData.mbti_confidence < 50) {
          personalityData.mbti_type = null
        }
        if (personalityData.enneagram_confidence && personalityData.enneagram_confidence < 50) {
          personalityData.enneagram_type = null
        }
        if (personalityData.bigfive_confidence && personalityData.bigfive_confidence < 50) {
          personalityData.bigfive_scores = null
        }

        const confidence: any = {}
        if (personalityData.mbti_confidence !== undefined) {
          confidence.mbti = personalityData.mbti_confidence
        }
        if (personalityData.enneagram_confidence !== undefined) {
          confidence.enneagram = personalityData.enneagram_confidence
        }
        if (personalityData.bigfive_confidence !== undefined) {
          confidence.bigfive = personalityData.bigfive_confidence
        }

        return {
          mbti_type: personalityData.mbti_type || null,
          enneagram_type: personalityData.enneagram_type || null,
          bigfive_scores: personalityData.bigfive_scores || null,
          personality_json: personalityData.personality_json || null,
          communication_style: personalityData.personality_json?.communication_style || null,
          personality_confidence: Object.keys(confidence).length > 0 ? confidence : null
        }
      } catch (parseError) {
        console.warn('Failed to parse personality analysis:', parseError)
        // Fall through to mock data
      }
    } catch (personalityError) {
      console.warn('Error inferring personality:', personalityError)
      // Fall through to mock data
    }
  }

  // Generate mock personality data
  const mbtiTypes = ['INTJ', 'ENTJ', 'INTP', 'ENTP', 'INFJ', 'ENFJ', 'INFP', 'ENFP', 'ISTJ', 'ESTJ', 'ISFJ', 'ESFJ', 'ISTP', 'ESTP', 'ISFP', 'ESFP']
  const enneagramTypes = ['1w2', '2w3', '3w2', '4w3', '5w4', '5w6', '6w5', '6w7', '7w6', '7w8', '8w7', '8w9', '9w8', '9w1']
  const communicationStyles = ['analytical', 'expressive', 'amiable', 'driver']

  // Use deterministic but varied selection based on name
  const nameHash = (firstName + lastName).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  
  return {
    mbti_type: mbtiTypes[nameHash % mbtiTypes.length],
    enneagram_type: enneagramTypes[nameHash % enneagramTypes.length],
    bigfive_scores: {
      openness: 50 + (nameHash % 40),
      conscientiousness: 50 + ((nameHash * 2) % 40),
      extraversion: 50 + ((nameHash * 3) % 40),
      agreeableness: 50 + ((nameHash * 4) % 40),
      neuroticism: 30 + ((nameHash * 5) % 40)
    },
    personality_json: {
      summary: `${firstName} is a ${jobTitle} with a focus on ${expertise.split(',')[0] || 'professional growth'}.`,
      key_traits: ['professional', 'focused', 'collaborative'],
      communication_style: communicationStyles[nameHash % communicationStyles.length]
    },
    communication_style: communicationStyles[nameHash % communicationStyles.length],
    personality_confidence: {
      mbti: 60 + (nameHash % 30),
      enneagram: 60 + ((nameHash * 2) % 30),
      bigfive: 65 + ((nameHash * 3) % 25)
    }
  }
}

async function seedUsers(count: number = 15) {
  console.log(`\n🌱 Starting seed process for ${count} users...\n`)

  // Get or create an event
  const eventId = await getOrCreateEvent()
  console.log(`📅 Using event ID: ${eventId}\n`)

  const seededUserIds: string[] = []

  for (let i = 1; i <= count; i++) {
    try {
      // Generate user data
      const firstName = randomChoice(FIRST_NAMES)
      const lastName = randomChoice(LAST_NAMES)
      const email = generateEmail(firstName, lastName)
      const userId = generateUserId()
      const jobTitle = randomChoice(JOB_TITLES)
      const company = randomChoice(COMPANIES)
      const experienceRange = randomChoice(EXPERIENCE_RANGES)
      const yearsExperience = parseYearsExperience(experienceRange)
      const expertise = randomChoice(EXPERTISE_AREAS)
      const hobbies = randomChoice(HOBBIES)

      // Create user profile
      const { error: userError } = await supabase
        .from('users')
        .insert({
          user_id: userId,
          email: email,
          first_name: firstName,
          last_name: lastName,
          photo_url: null, // You can add photo URLs later if needed
          career_title: jobTitle,
          company_name: company,
          career_years_experience: yearsExperience,
          expertise_summary: expertise,
          hobbies: hobbies
        })

      if (userError) {
        console.error(`❌ Error creating user ${i}:`, userError.message)
        continue
      }

      // Generate connection types (1-5 random selections)
      const connectionTypes = randomChoices(CONNECTION_TYPES, 1, 5)

      // Generate follow-up responses
      const followUpResponses: Record<string, string> = {}
      connectionTypes.forEach(type => {
        const responses = FOLLOW_UP_QUESTIONS[type]
        if (responses && responses.length > 0) {
          followUpResponses[type] = randomChoice(responses)
        }
      })

      // Generate why attending and business need
      const whyAttending = randomChoice(WHY_ATTENDING)
      const businessNeed = randomChoice(BUSINESS_NEEDS)

      // Generate AI questionnaire answers (3-4 questions)
      const numQuestions = randomInt(3, 4)
      const adaptiveQnA = {
        version: 'v1',
        asked: AI_QUESTIONS.slice(0, numQuestions).map(q => {
          const selectedOption = randomChoice(q.options)
          return {
            qid: q.id,
            choice: selectedOption.key,
            questionText: q.text
          }
        })
      }

      // Create attendance record
      const { error: attendanceError } = await supabase
        .from('attendance')
        .insert({
          event_id: eventId,
          user_id: userId,
          attendee_first_name: firstName,
          attendee_last_name: lastName,
          why_attending_text: whyAttending,
          connection_types_selected: connectionTypes,
          connection_followups_json: followUpResponses,
          business_need_text: businessNeed,
          onboarding_completed: true,
          adaptive_qna_json: adaptiveQnA,
          checked_in_at: new Date().toISOString()
        })

      if (attendanceError) {
        console.error(`❌ Error creating attendance for user ${i}:`, attendanceError.message)
        // Clean up user if attendance fails
        await supabase.from('users').delete().eq('user_id', userId)
        continue
      }

      // After creating attendance, derive summaries/tags similar to onboarding flow
      await deriveDataForUser(eventId, userId)

      seededUserIds.push(userId)
      console.log(`✅ Created user ${i}/${count}: ${firstName} ${lastName} (${email})`)
      console.log(`   - Connection types: ${connectionTypes.join(', ')}`)
      console.log(`   - AI questions answered: ${numQuestions}`)

    } catch (error: any) {
      console.error(`❌ Error seeding user ${i}:`, error.message)
    }
  }

  console.log(`\n🎉 Seed complete! Created ${seededUserIds.length} users.`)
  console.log(`\n📝 Seeded user IDs (save these for cleanup):`)
  console.log(JSON.stringify(seededUserIds, null, 2))

  // Verification: count and list a few seeded users and attendance rows
  try {
    const { count: seededUserCount } = await supabase
      .from('users')
      .select('user_id', { count: 'exact', head: true })
      .like('email', '%@seed-example.com') as unknown as { count: number | null }

    const { data: sampleUsers } = await supabase
      .from('users')
      .select('user_id, email, first_name, last_name')
      .like('email', '%@seed-example.com')
      .limit(3)

    console.log(`\n🔎 Verification — users with @seed-example.com: ${seededUserCount ?? 0}`)
    if (sampleUsers && sampleUsers.length > 0) {
      console.log('   Sample:')
      sampleUsers.forEach(u => console.log(`   - ${u.first_name} ${u.last_name} <${u.email}> (${u.user_id})`))
    }

    const { count: attendanceCount } = await (supabase as any)
      .from('attendance')
      .select('user_id', { count: 'exact', head: true })
      .in('user_id', seededUserIds) as unknown as { count: number | null }

    console.log(`🔎 Verification — attendance rows for seeded users: ${attendanceCount ?? 0}`)
  } catch (vErr: any) {
    console.warn('Verification step encountered an error (non-blocking):', vErr?.message || vErr)
  }

  return seededUserIds
}

function simpleSummary(params: {
  firstName?: string | null
  lastName?: string | null
  jobTitle?: string | null
  company?: string | null
  expertise?: string | null
  why?: string | null
  connectionTypes?: string[]
  businessNeed?: string | null
}) {
  const { firstName, lastName, jobTitle, company, expertise, why, connectionTypes = [], businessNeed } = params
  let s = `${firstName || 'This person'} ${lastName || ''}`.trim()
  s += ` is a ${jobTitle || 'professional'}`
  if (company) s += ` at ${company}`
  if (expertise) s += ` with expertise in ${expertise}`
  if (why) s += `. They're attending because ${why}`
  if (connectionTypes.length) s += `. Looking for: ${connectionTypes.join(', ')}`
  if (businessNeed) s += `. Business need: ${businessNeed}`
  return s
}

async function deriveDataForUser(eventId: string, userId: string) {
  // Load necessary data
  const { data: user } = await supabase
    .from('users')
    .select('first_name,last_name,career_title,company_name,expertise_summary,hobbies')
    .eq('user_id', userId)
    .single()

  const { data: att } = await supabase
    .from('attendance')
    .select('why_attending_text,business_need_text,connection_types_selected,adaptive_qna_json')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single()

  const connectionTypes: string[] = (att?.connection_types_selected as any) || []

  // Tags & intents
  const offerTags: string[] = []
  const wantTags: string[] = []
  const goalsTags: string[] = []
  let availabilityStatus = 'open'
  let roleIntent = 'general'

  if (connectionTypes.includes('be_mentor')) {
    offerTags.push('mentor'); goalsTags.push('mentorship')
  }
  if (connectionTypes.includes('find_mentor')) {
    wantTags.push('mentor'); goalsTags.push('learning')
  }
  if (connectionTypes.includes('biz_opps')) {
    wantTags.push('business_opportunities'); goalsTags.push('networking')
  }
  if (connectionTypes.includes('find_job')) {
    wantTags.push('job_opportunities'); goalsTags.push('career_growth'); availabilityStatus = 'actively_building'; roleIntent = 'job_seeker'
  }
  if (connectionTypes.includes('recruit')) {
    offerTags.push('recruiting'); goalsTags.push('hiring')
  }
  if (connectionTypes.includes('find_mentor') || connectionTypes.includes('be_mentor')) {
    roleIntent = roleIntent === 'job_seeker' ? roleIntent : 'mentor'
  }

  if (user?.expertise_summary) {
    const expertiseWords = String(user.expertise_summary).toLowerCase().split(/[\,\s]+/).filter(w => w.length > 2)
    offerTags.push(...expertiseWords.slice(0, 3))
  }

  if (att?.business_need_text) {
    const needWords = String(att.business_need_text).toLowerCase().split(/[\,\s]+/).filter(w => w.length > 3)
    goalsTags.push(...needWords.slice(0, 2))
  }

  // Summaries (local-only heuristic; no AI calls run locally)
  const basic = simpleSummary({
    firstName: user?.first_name,
    lastName: user?.last_name,
    jobTitle: user?.career_title,
    company: user?.company_name,
    expertise: user?.expertise_summary || undefined,
    why: att?.why_attending_text || undefined,
    connectionTypes,
    businessNeed: att?.business_need_text || undefined
  })
  const offerSummaryText = basic
  const wantSummaryText = att?.business_need_text || att?.why_attending_text || 'Looking to meet interesting people and explore opportunities.'

  // Generate embeddings
  const offerEmbedding = await generateEmbedding(offerSummaryText)
  const wantEmbedding = await generateEmbedding(wantSummaryText)
  
  // Generate event profile embedding (combination of offer + want + event context)
  const eventProfileText = `Offer: ${offerSummaryText}\nWant: ${wantSummaryText}`
  const eventProfileEmbedding = await generateEmbedding(eventProfileText)

  // Generate personality data
  const personalityData = await generatePersonalityData({
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    jobTitle: user?.career_title || '',
    company: user?.company_name || '',
    expertise: user?.expertise_summary || '',
    hobbies: (user?.hobbies as string[]) || [],
    whyAttending: att?.why_attending_text || '',
    connectionTypes,
    businessNeed: att?.business_need_text || '',
    adaptiveQnA: att?.adaptive_qna_json || null
  })

  // Update attendance with derived data including embeddings
  const attendanceUpdate: any = {
    event_profile_summary_text: simpleSummary({
      firstName: user?.first_name,
      lastName: user?.last_name,
      jobTitle: user?.career_title,
      company: user?.company_name,
      expertise: user?.expertise_summary || undefined,
      why: att?.why_attending_text || undefined,
      connectionTypes,
      businessNeed: att?.business_need_text || undefined
    }),
    event_offer_tags: offerTags,
    event_want_tags: wantTags,
    event_goals_tags: goalsTags,
    event_availability_status: availabilityStatus,
    event_role_intent: roleIntent
  }

  // Add event profile embedding if generated
  if (eventProfileEmbedding && eventProfileEmbedding.length > 0) {
    attendanceUpdate.event_profile_embedding = eventProfileEmbedding
  }

  await supabase
    .from('attendance')
    .update(attendanceUpdate)
    .eq('event_id', eventId)
    .eq('user_id', userId)

  // Update users with all derived data including embeddings and personality
  const userUpdate: any = {
    offer_summary_text: offerSummaryText,
    want_summary_text: wantSummaryText,
    offer_tags: offerTags,
    want_tags: wantTags,
    career_goals_tags: goalsTags,
    engagement_availability_status: availabilityStatus,
    collaboration_role_intent: roleIntent,
    personality_last_updated: new Date().toISOString()
  }

  // Add embeddings if generated
  if (offerEmbedding && offerEmbedding.length > 0) {
    userUpdate.offer_embedding = offerEmbedding
  }
  if (wantEmbedding && wantEmbedding.length > 0) {
    userUpdate.want_embedding = wantEmbedding
  }

  // Add personality data
  if (personalityData.mbti_type) {
    userUpdate.mbti_type = personalityData.mbti_type
  }
  if (personalityData.enneagram_type) {
    userUpdate.enneagram_type = personalityData.enneagram_type
  }
  if (personalityData.bigfive_scores) {
    userUpdate.bigfive_scores = personalityData.bigfive_scores
  }
  if (personalityData.personality_json) {
    userUpdate.personality_json = personalityData.personality_json
  }
  if (personalityData.communication_style) {
    userUpdate.communication_style = personalityData.communication_style
  }
  if (personalityData.personality_confidence) {
    userUpdate.personality_confidence = personalityData.personality_confidence
  }

  await supabase
    .from('users')
    .update(userUpdate)
    .eq('user_id', userId)
}

async function wipeSeedData() {
  console.log(`\n🧹 Starting wipe process...\n`)

  // Find all seeded users (users with @seed-example.com emails)
  const { data: seededUsers, error: fetchError } = await supabase
    .from('users')
    .select('user_id')
    .like('email', '%@seed-example.com')

  if (fetchError) {
    console.error('❌ Error fetching seeded users:', fetchError.message)
    return
  }

  if (!seededUsers || seededUsers.length === 0) {
    console.log('✅ No seeded users found to delete.')
    return
  }

  const userIds = seededUsers.map(u => u.user_id)
  console.log(`Found ${userIds.length} seeded users to delete.`)

  // Delete attendance records first (foreign key constraint)
  const { error: attendanceError } = await (supabase as any)
    .from('attendance')
    .in('user_id', userIds)
    .delete()

  if (attendanceError) {
    console.error('❌ Error deleting attendance records:', attendanceError.message)
  } else {
    console.log(`✅ Deleted ${userIds.length} attendance records.`)
  }

  // Delete users
  const { error: usersError } = await (supabase as any)
    .from('users')
    .in('user_id', userIds)
    .delete()

  if (usersError) {
    console.error('❌ Error deleting users:', usersError.message)
  } else {
    console.log(`✅ Deleted ${userIds.length} users.`)
  }

  console.log(`\n🎉 Wipe complete!`)
}

// Main execution
const command = process.argv[2]

if (command === 'wipe' || command === 'wipe:all') {
  wipeSeedData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
} else {
  // Parse count if provided, default to 15
  let count = 15
  if (command && command !== 'wipe' && command !== 'wipe:all') {
    const parsed = parseInt(command, 10)
    if (!isNaN(parsed) && parsed > 0) {
      count = parsed
    }
  }
  seedUsers(count)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

