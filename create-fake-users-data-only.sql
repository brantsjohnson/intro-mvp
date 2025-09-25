-- Create fake user data (hobbies, expertise, event membership)
-- Run this AFTER running create-fake-users-complete.js
-- This script assumes auth users and profiles already exist

-- First, let's ensure we have some basic hobbies and expertise tags
INSERT INTO hobbies (label) VALUES 
('🎨 Arts & Music'),
('🎭 Comedy'),
('👔 Entrepreneurship'),
('🍳 Food & Drink'),
('🎬 Films'),
('🎮 Gaming'),
('🏞 Outdoors & Travel'),
('🐾 Pets & Animals'),
('👨‍👩‍👧 Family & Parenting'),
('🧘 Wellness & Health'),
('📚 Reading'),
('🏃‍♂️ Fitness'),
('🎵 Music Production'),
('📸 Photography'),
('✈️ Travel')
ON CONFLICT (label) DO NOTHING;

-- Insert expertise tags if they don't exist
INSERT INTO expertise_tags (label) VALUES 
('JavaScript'),
('Python'),
('React'),
('Node.js'),
('AWS'),
('Machine Learning'),
('Product Management'),
('Marketing'),
('Sales'),
('Design'),
('Data Science'),
('DevOps'),
('Mobile Development'),
('Blockchain'),
('AI/ML'),
('Startup Experience'),
('Leadership'),
('Finance'),
('Operations'),
('Customer Success')
ON CONFLICT (label) DO NOTHING;

-- Add profile hobbies (linking users to hobbies)
INSERT INTO profile_hobbies (user_id, hobby_id) VALUES 
-- Alex Chen - Tech founder interests
('11111111-1111-1111-1111-111111111111', (SELECT id FROM hobbies WHERE label = '👔 Entrepreneurship')),
('11111111-1111-1111-1111-111111111111', (SELECT id FROM hobbies WHERE label = '📚 Reading')),
('11111111-1111-1111-1111-111111111111', (SELECT id FROM hobbies WHERE label = '🏃‍♂️ Fitness')),

-- Sarah Johnson - Marketing professional
('22222222-2222-2222-2222-222222222222', (SELECT id FROM hobbies WHERE label = '🎨 Arts & Music')),
('22222222-2222-2222-2222-222222222222', (SELECT id FROM hobbies WHERE label = '📸 Photography')),
('22222222-2222-2222-2222-222222222222', (SELECT id FROM hobbies WHERE label = '✈️ Travel')),

-- Marcus Rodriguez - Software engineer
('33333333-3333-3333-3333-333333333333', (SELECT id FROM hobbies WHERE label = '🎮 Gaming')),
('33333333-3333-3333-3333-333333333333', (SELECT id FROM hobbies WHERE label = '📚 Reading')),
('33333333-3333-3333-3333-333333333333', (SELECT id FROM hobbies WHERE label = '🏃‍♂️ Fitness')),

-- Emma Thompson - Product manager
('44444444-4444-4444-4444-444444444444', (SELECT id FROM hobbies WHERE label = '🎬 Films')),
('44444444-4444-4444-4444-444444444444', (SELECT id FROM hobbies WHERE label = '🧘 Wellness & Health')),
('44444444-4444-4444-4444-444444444444', (SELECT id FROM hobbies WHERE label = '📚 Reading')),

-- David Kim - Data scientist
('55555555-5555-5555-5555-555555555555', (SELECT id FROM hobbies WHERE label = '🎮 Gaming')),
('55555555-5555-5555-5555-555555555555', (SELECT id FROM hobbies WHERE label = '📚 Reading')),
('55555555-5555-5555-5555-555555555555', (SELECT id FROM hobbies WHERE label = '🏞 Outdoors & Travel')),

-- Zoe Martinez - Designer
('66666666-6666-6666-6666-666666666666', (SELECT id FROM hobbies WHERE label = '🎨 Arts & Music')),
('66666666-6666-6666-6666-666666666666', (SELECT id FROM hobbies WHERE label = '📸 Photography')),
('66666666-6666-6666-6666-666666666666', (SELECT id FROM hobbies WHERE label = '🧘 Wellness & Health')),

-- James Wilson - Sales director
('77777777-7777-7777-7777-777777777777', (SELECT id FROM hobbies WHERE label = '🍳 Food & Drink')),
('77777777-7777-7777-7777-777777777777', (SELECT id FROM hobbies WHERE label = '🏃‍♂️ Fitness')),
('77777777-7777-7777-7777-777777777777', (SELECT id FROM hobbies WHERE label = '✈️ Travel')),

-- Priya Patel - DevOps engineer
('88888888-8888-8888-8888-888888888888', (SELECT id FROM hobbies WHERE label = '🎮 Gaming')),
('88888888-8888-8888-8888-888888888888', (SELECT id FROM hobbies WHERE label = '📚 Reading')),
('88888888-8888-8888-8888-888888888888', (SELECT id FROM hobbies WHERE label = '🏞 Outdoors & Travel')),

-- Michael Brown - Business analyst
('99999999-9999-9999-9999-999999999999', (SELECT id FROM hobbies WHERE label = '👔 Entrepreneurship')),
('99999999-9999-9999-9999-999999999999', (SELECT id FROM hobbies WHERE label = '📚 Reading')),
('99999999-9999-9999-9999-999999999999', (SELECT id FROM hobbies WHERE label = '🎬 Films')),

-- Lisa Garcia - Mobile developer
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM hobbies WHERE label = '🎮 Gaming')),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM hobbies WHERE label = '🎵 Music Production')),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM hobbies WHERE label = '🧘 Wellness & Health')),

-- Ryan O'Connor - Content creator
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (SELECT id FROM hobbies WHERE label = '🎨 Arts & Music')),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (SELECT id FROM hobbies WHERE label = '📸 Photography')),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (SELECT id FROM hobbies WHERE label = '🎭 Comedy')),

-- Amanda Lee - Financial analyst
('cccccccc-cccc-cccc-cccc-cccccccccccc', (SELECT id FROM hobbies WHERE label = '📚 Reading')),
('cccccccc-cccc-cccc-cccc-cccccccccccc', (SELECT id FROM hobbies WHERE label = '🏃‍♂️ Fitness')),
('cccccccc-cccc-cccc-cccc-cccccccccccc', (SELECT id FROM hobbies WHERE label = '✈️ Travel')),

-- Carlos Silva - Operations manager
('dddddddd-dddd-dddd-dddd-dddddddddddd', (SELECT id FROM hobbies WHERE label = '🏃‍♂️ Fitness')),
('dddddddd-dddd-dddd-dddd-dddddddddddd', (SELECT id FROM hobbies WHERE label = '🍳 Food & Drink')),
('dddddddd-dddd-dddd-dddd-dddddddddddd', (SELECT id FROM hobbies WHERE label = '🏞 Outdoors & Travel')),

-- Nina Volkov - AI researcher
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', (SELECT id FROM hobbies WHERE label = '📚 Reading')),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', (SELECT id FROM hobbies WHERE label = '🎮 Gaming')),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', (SELECT id FROM hobbies WHERE label = '🧘 Wellness & Health')),

-- Tom Anderson - Customer success manager
('ffffffff-ffff-ffff-ffff-ffffffffffff', (SELECT id FROM hobbies WHERE label = '👨‍👩‍👧 Family & Parenting')),
('ffffffff-ffff-ffff-ffff-ffffffffffff', (SELECT id FROM hobbies WHERE label = '🏃‍♂️ Fitness')),
('ffffffff-ffff-ffff-ffff-ffffffffffff', (SELECT id FROM hobbies WHERE label = '🍳 Food & Drink'));

-- Add custom hobbies for some users
INSERT INTO custom_hobbies (id, user_id, label) VALUES 
('custom-1', '11111111-1111-1111-1111-111111111111', 'Rock Climbing'),
('custom-2', '33333333-3333-3333-3333-333333333333', 'Chess'),
('custom-3', '55555555-5555-5555-5555-555555555555', 'Board Games'),
('custom-4', '77777777-7777-7777-7777-777777777777', 'Wine Tasting'),
('custom-5', '99999999-9999-9999-9999-999999999999', 'Podcasting');

INSERT INTO profile_custom_hobbies (user_id, custom_hobby_id, details) VALUES 
('11111111-1111-1111-1111-111111111111', 'custom-1', 'Indoor and outdoor climbing'),
('33333333-3333-3333-3333-333333333333', 'custom-2', 'Competitive chess player'),
('55555555-5555-5555-5555-555555555555', 'custom-3', 'Strategy and euro games'),
('77777777-7777-7777-7777-777777777777', 'custom-4', 'Exploring different wine regions'),
('99999999-9999-9999-9999-999999999999', 'custom-5', 'Tech and business podcast');

-- Add profile expertise (linking users to expertise tags)
INSERT INTO profile_expertise (user_id, tag_id) VALUES 
-- Alex Chen - Startup founder
('11111111-1111-1111-1111-111111111111', (SELECT id FROM expertise_tags WHERE label = 'Startup Experience')),
('11111111-1111-1111-1111-111111111111', (SELECT id FROM expertise_tags WHERE label = 'Leadership')),
('11111111-1111-1111-1111-111111111111', (SELECT id FROM expertise_tags WHERE label = 'Product Management')),

-- Sarah Johnson - Marketing
('22222222-2222-2222-2222-222222222222', (SELECT id FROM expertise_tags WHERE label = 'Marketing')),
('22222222-2222-2222-2222-222222222222', (SELECT id FROM expertise_tags WHERE label = 'Leadership')),
('22222222-2222-2222-2222-222222222222', (SELECT id FROM expertise_tags WHERE label = 'Design')),

-- Marcus Rodriguez - Software engineer
('33333333-3333-3333-3333-333333333333', (SELECT id FROM expertise_tags WHERE label = 'JavaScript')),
('33333333-3333-3333-3333-333333333333', (SELECT id FROM expertise_tags WHERE label = 'Node.js')),
('33333333-3333-3333-3333-333333333333', (SELECT id FROM expertise_tags WHERE label = 'AWS')),

-- Emma Thompson - Product manager
('44444444-4444-4444-4444-444444444444', (SELECT id FROM expertise_tags WHERE label = 'Product Management')),
('44444444-4444-4444-4444-444444444444', (SELECT id FROM expertise_tags WHERE label = 'Leadership')),
('44444444-4444-4444-4444-444444444444', (SELECT id FROM expertise_tags WHERE label = 'Design')),

-- David Kim - Data scientist
('55555555-5555-5555-5555-555555555555', (SELECT id FROM expertise_tags WHERE label = 'Python')),
('55555555-5555-5555-5555-555555555555', (SELECT id FROM expertise_tags WHERE label = 'Data Science')),
('55555555-5555-5555-5555-555555555555', (SELECT id FROM expertise_tags WHERE label = 'Machine Learning')),

-- Zoe Martinez - Designer
('66666666-6666-6666-6666-666666666666', (SELECT id FROM expertise_tags WHERE label = 'Design')),
('66666666-6666-6666-6666-666666666666', (SELECT id FROM expertise_tags WHERE label = 'Product Management')),

-- James Wilson - Sales
('77777777-7777-7777-7777-777777777777', (SELECT id FROM expertise_tags WHERE label = 'Sales')),
('77777777-7777-7777-7777-777777777777', (SELECT id FROM expertise_tags WHERE label = 'Leadership')),
('77777777-7777-7777-7777-777777777777', (SELECT id FROM expertise_tags WHERE label = 'Customer Success')),

-- Priya Patel - DevOps
('88888888-8888-8888-8888-888888888888', (SELECT id FROM expertise_tags WHERE label = 'DevOps')),
('88888888-8888-8888-8888-888888888888', (SELECT id FROM expertise_tags WHERE label = 'AWS')),
('88888888-8888-8888-8888-888888888888', (SELECT id FROM expertise_tags WHERE label = 'Python')),

-- Michael Brown - Business analyst
('99999999-9999-9999-9999-999999999999', (SELECT id FROM expertise_tags WHERE label = 'Finance')),
('99999999-9999-9999-9999-999999999999', (SELECT id FROM expertise_tags WHERE label = 'Operations')),
('99999999-9999-9999-9999-999999999999', (SELECT id FROM expertise_tags WHERE label = 'Data Science')),

-- Lisa Garcia - Mobile developer
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM expertise_tags WHERE label = 'Mobile Development')),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM expertise_tags WHERE label = 'JavaScript')),

-- Ryan O'Connor - Content creator
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (SELECT id FROM expertise_tags WHERE label = 'Marketing')),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (SELECT id FROM expertise_tags WHERE label = 'Design')),

-- Amanda Lee - Financial analyst
('cccccccc-cccc-cccc-cccc-cccccccccccc', (SELECT id FROM expertise_tags WHERE label = 'Finance')),
('cccccccc-cccc-cccc-cccc-cccccccccccc', (SELECT id FROM expertise_tags WHERE label = 'Data Science')),

-- Carlos Silva - Operations manager
('dddddddd-dddd-dddd-dddd-dddddddddddd', (SELECT id FROM expertise_tags WHERE label = 'Operations')),
('dddddddd-dddd-dddd-dddd-dddddddddddd', (SELECT id FROM expertise_tags WHERE label = 'Leadership')),

-- Nina Volkov - AI researcher
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', (SELECT id FROM expertise_tags WHERE label = 'AI/ML')),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', (SELECT id FROM expertise_tags WHERE label = 'Python')),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', (SELECT id FROM expertise_tags WHERE label = 'Machine Learning')),

-- Tom Anderson - Customer success
('ffffffff-ffff-ffff-ffff-ffffffffffff', (SELECT id FROM expertise_tags WHERE label = 'Customer Success')),
('ffffffff-ffff-ffff-ffff-ffffffffffff', (SELECT id FROM expertise_tags WHERE label = 'Sales'));

-- Add all users to the FRESH event
INSERT INTO event_members (event_id, user_id, is_present) VALUES 
('49911d40-19fd-4add-8c7c-8e1668421715', '11111111-1111-1111-1111-111111111111', true),
('49911d40-19fd-4add-8c7c-8e1668421715', '22222222-2222-2222-2222-222222222222', true),
('49911d40-19fd-4add-8c7c-8e1668421715', '33333333-3333-3333-3333-333333333333', true),
('49911d40-19fd-4add-8c7c-8e1668421715', '44444444-4444-4444-4444-444444444444', true),
('49911d40-19fd-4add-8c7c-8e1668421715', '55555555-5555-5555-5555-555555555555', true),
('49911d40-19fd-4add-8c7c-8e1668421715', '66666666-6666-6666-6666-666666666666', true),
('49911d40-19fd-4add-8c7c-8e1668421715', '77777777-7777-7777-7777-777777777777', true),
('49911d40-19fd-4add-8c7c-8e1668421715', '88888888-8888-8888-8888-888888888888', true),
('49911d40-19fd-4add-8c7c-8e1668421715', '99999999-9999-9999-9999-999999999999', true),
('49911d40-19fd-4add-8c7c-8e1668421715', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
('49911d40-19fd-4add-8c7c-8e1668421715', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true),
('49911d40-19fd-4add-8c7c-8e1668421715', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true),
('49911d40-19fd-4add-8c7c-8e1668421715', 'dddddddd-dddd-dddd-dddd-dddddddddddd', true),
('49911d40-19fd-4add-8c7c-8e1668421715', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true),
('49911d40-19fd-4add-8c7c-8e1668421715', 'ffffffff-ffff-ffff-ffff-ffffffffffff', true);

-- Add event-specific networking goals for FRESH event
-- Mix of predefined checkboxes and custom responses for realistic variety
INSERT INTO event_networking_goals (event_id, user_id, networking_goals) VALUES 
-- Alex Chen - Startup founder (business opportunities + custom)
('49911d40-19fd-4add-8c7c-8e1668421715', '11111111-1111-1111-1111-111111111111', '["business-opportunities", "Looking for technical co-founder", "Seeking investors"]'),

-- Sarah Johnson - Marketing (career mentorship + friends)
('49911d40-19fd-4add-8c7c-8e1668421715', '22222222-2222-2222-2222-222222222222', '["career-mentorship", "friends-connections", "Find marketing mentors"]'),

-- Marcus Rodriguez - Software engineer (career mentorship + business)
('49911d40-19fd-4add-8c7c-8e1668421715', '33333333-3333-3333-3333-333333333333', '["career-mentorship", "business-opportunities", "Learn about startup opportunities"]'),

-- Emma Thompson - Product manager (clients + career mentorship)
('49911d40-19fd-4add-8c7c-8e1668421715', '44444444-4444-4444-4444-444444444444', '["clients", "career-mentorship", "Meet potential customers"]'),

-- David Kim - Data scientist (business opportunities + friends)
('49911d40-19fd-4add-8c7c-8e1668421715', '55555555-5555-5555-5555-555555555555', '["business-opportunities", "friends-connections", "Explore data science opportunities"]'),

-- Zoe Martinez - Designer (friends + career mentorship)
('49911d40-19fd-4add-8c7c-8e1668421715', '66666666-6666-6666-6666-666666666666', '["friends-connections", "career-mentorship", "Find design collaborators"]'),

-- James Wilson - Sales (clients + business opportunities)
('49911d40-19fd-4add-8c7c-8e1668421715', '77777777-7777-7777-7777-777777777777', '["clients", "business-opportunities", "Find new clients"]'),

-- Priya Patel - DevOps (career mentorship + friends)
('49911d40-19fd-4add-8c7c-8e1668421715', '88888888-8888-8888-8888-888888888888', '["career-mentorship", "friends-connections", "Learn about DevOps best practices"]'),

-- Michael Brown - Business analyst (business opportunities + career mentorship)
('49911d40-19fd-4add-8c7c-8e1668421715', '99999999-9999-9999-9999-999999999999', '["business-opportunities", "career-mentorship", "Explore business opportunities"]'),

-- Lisa Garcia - Mobile developer (friends + career mentorship)
('49911d40-19fd-4add-8c7c-8e1668421715', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '["friends-connections", "career-mentorship", "Connect with mobile developers"]'),

-- Ryan O'Connor - Content creator (clients + friends)
('49911d40-19fd-4add-8c7c-8e1668421715', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '["clients", "friends-connections", "Find content creation clients"]'),

-- Amanda Lee - Financial analyst (business opportunities + career mentorship)
('49911d40-19fd-4add-8c7c-8e1668421715', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '["business-opportunities", "career-mentorship", "Explore fintech opportunities"]'),

-- Carlos Silva - Operations manager (business opportunities + clients)
('49911d40-19fd-4add-8c7c-8e1668421715', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '["business-opportunities", "clients", "Find operations opportunities"]'),

-- Nina Volkov - AI researcher (career mentorship + business opportunities)
('49911d40-19fd-4add-8c7c-8e1668421715', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '["career-mentorship", "business-opportunities", "Find AI research collaborators"]'),

-- Tom Anderson - Customer success (friends + clients)
('49911d40-19fd-4add-8c7c-8e1668421715', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '["friends-connections", "clients", "Find customer success opportunities"]');

-- Success message
SELECT 'Successfully created fake user data (hobbies, expertise, event membership)!' as result;
