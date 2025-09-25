-- Populate fake user profiles with realistic onboarding data
-- This script updates the existing profiles with complete onboarding information

-- Update profiles with realistic data based on the onboarding flow
UPDATE profiles SET
  first_name = 'Alex',
  last_name = 'Chen',
  job_title = 'Founder & CEO',
  company = 'TechFlow',
  what_do_you_do = 'Building the future of remote work with AI-powered collaboration tools',
  mbti = 'ENTJ',
  enneagram = '8w7',
  networking_goals = '["business-opportunities", "Looking for technical co-founder", "Seeking investors"]',
  career_goals = 'Scale TechFlow to 100+ employees and expand internationally',
  who_they_want_to_meet = 'Technical co-founders, VCs, and enterprise customers'
WHERE id = '5e8a1d33-41f7-40d0-ada4-550d21533a1b';

UPDATE profiles SET
  first_name = 'Sarah',
  last_name = 'Johnson',
  job_title = 'Marketing Director',
  company = 'GrowthCo',
  what_do_you_do = 'Scaling brands through digital marketing and growth hacking strategies',
  mbti = 'ENFP',
  enneagram = '2w3',
  networking_goals = '["career-mentorship", "friends-connections", "Find marketing mentors"]',
  career_goals = 'Become a CMO at a fast-growing startup',
  who_they_want_to_meet = 'Marketing leaders and growth experts who can mentor me'
WHERE id = '097c55f0-5d64-4e42-ab30-18515606bdf4';

UPDATE profiles SET
  first_name = 'Marcus',
  last_name = 'Rodriguez',
  job_title = 'Senior Software Engineer',
  company = 'BigTech Inc',
  what_do_you_do = 'Building scalable backend systems and microservices architecture',
  mbti = 'INTJ',
  enneagram = '5w4',
  networking_goals = '["career-mentorship", "business-opportunities", "Learn about startup opportunities"]',
  career_goals = 'Transition to a tech lead role or join an early-stage startup',
  who_they_want_to_meet = 'Engineering leaders and startup founders'
WHERE id = 'e3e48b02-d906-40a3-ad3b-7873ddb2f871';

UPDATE profiles SET
  first_name = 'Emma',
  last_name = 'Thompson',
  job_title = 'Product Manager',
  company = 'InnovateCorp',
  what_do_you_do = 'Leading product strategy and user experience for B2B SaaS platforms',
  mbti = 'ENFJ',
  enneagram = '2w1',
  networking_goals = '["clients", "career-mentorship", "Meet potential customers"]',
  career_goals = 'Become a VP of Product at a unicorn startup',
  who_they_want_to_meet = 'Product leaders and potential enterprise customers'
WHERE id = '60d7b9fc-cde9-4953-8cda-78872912aec6';

UPDATE profiles SET
  first_name = 'David',
  last_name = 'Kim',
  job_title = 'Data Scientist',
  company = 'AnalyticsPro',
  what_do_you_do = 'Turning data into actionable insights using machine learning and AI',
  mbti = 'INTP',
  enneagram = '5w6',
  networking_goals = '["business-opportunities", "friends-connections", "Explore data science opportunities"]',
  career_goals = 'Start my own AI consulting company',
  who_they_want_to_meet = 'Data science leaders and AI entrepreneurs'
WHERE id = 'c2d15c3d-e383-4fa5-81d9-c8886e11f5c8';

UPDATE profiles SET
  first_name = 'Zoe',
  last_name = 'Martinez',
  job_title = 'UX Designer',
  company = 'CreativeStudio',
  what_do_you_do = 'Creating beautiful and functional user experiences for mobile and web apps',
  mbti = 'ISFP',
  enneagram = '4w5',
  networking_goals = '["friends-connections", "career-mentorship", "Find design collaborators"]',
  career_goals = 'Launch my own design agency focused on social impact',
  who_they_want_to_meet = 'Design leaders and social impact entrepreneurs'
WHERE id = 'aa49a9c8-4cef-43c7-9f92-1fb277ceb961';

UPDATE profiles SET
  first_name = 'James',
  last_name = 'Wilson',
  job_title = 'Sales Director',
  company = 'RevenueMax',
  what_do_you_do = 'Building relationships and closing deals for enterprise software solutions',
  mbti = 'ESTJ',
  enneagram = '3w2',
  networking_goals = '["clients", "business-opportunities", "Find new clients"]',
  career_goals = 'Become a VP of Sales at a high-growth company',
  who_they_want_to_meet = 'Sales leaders and potential enterprise clients'
WHERE id = '4ceb8e16-8d54-410a-89a7-97240e907318';

UPDATE profiles SET
  first_name = 'Priya',
  last_name = 'Patel',
  job_title = 'DevOps Engineer',
  company = 'CloudTech',
  what_do_you_do = 'Automating infrastructure and deployment pipelines for cloud-native applications',
  mbti = 'ISTJ',
  enneagram = '1w9',
  networking_goals = '["career-mentorship", "friends-connections", "Learn about DevOps best practices"]',
  career_goals = 'Become a Principal Engineer and mentor other DevOps professionals',
  who_they_want_to_meet = 'Senior DevOps engineers and infrastructure leaders'
WHERE id = 'fe6546bd-5747-46e0-9c69-8ddfb498d529';

UPDATE profiles SET
  first_name = 'Michael',
  last_name = 'Brown',
  job_title = 'Business Analyst',
  company = 'StrategyCorp',
  what_do_you_do = 'Analyzing business processes and improving efficiency through data-driven insights',
  mbti = 'ENTP',
  enneagram = '7w8',
  networking_goals = '["business-opportunities", "career-mentorship", "Explore business opportunities"]',
  career_goals = 'Transition to management consulting or start my own business',
  who_they_want_to_meet = 'Management consultants and successful entrepreneurs'
WHERE id = '9cfc0875-f455-4d43-9287-2fc3ca8a149b';

UPDATE profiles SET
  first_name = 'Lisa',
  last_name = 'Garcia',
  job_title = 'Mobile Developer',
  company = 'AppWorks',
  what_do_you_do = 'Building native iOS and Android apps with React Native and Swift',
  mbti = 'ISFJ',
  enneagram = '6w5',
  networking_goals = '["friends-connections", "career-mentorship", "Connect with mobile developers"]',
  career_goals = 'Become a mobile tech lead and contribute to open source projects',
  who_they_want_to_meet = 'Mobile development leaders and open source contributors'
WHERE id = '5a7fc925-0c7e-411b-9d94-2e58f1f55fc9';

-- Success message
SELECT 'Successfully populated all fake user profiles with realistic onboarding data!' as result;
