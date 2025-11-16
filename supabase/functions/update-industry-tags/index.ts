import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !serviceRoleKey || !openAIApiKey) {
  console.error("Missing required environment variables.");
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

async function extractIndustryTags(
  companyName: string,
  companySummary: string,
  companyUrl: string | null,
): Promise<string[]> {
  const fallback: string[] = [];

  // APPROVED INDUSTRY TAXONOMY - All tags must come from this list
  const validTags = [
    "fintech",
    "banking",
    "payments",
    "insurance",
    "ecommerce",
    "retail",
    "enterprise_software",
    "saas",
    "cybersecurity",
    "marketing",
    "advertising",
    "media",
    "social_media",
    "real_estate",
    "recruiting",
    "hrtech",
    "travel",
    "hospitality",
    "transportation",
    "logistics",
    "healthtech",
    "biotech",
    "entertainment",
    "gaming",
    "edtech",
    "education",
    "higher_education",
    "research",
    "academia",
    "ai",
    "infrastructure",
    "cloud",
    "developer_tools",
    "telecommunications",
    "productivity",
    "marketplaces",
    "consumer_goods",
    "food_delivery",
    "sports",
    "fitness",
    "hardware",
    "wearables",
    "government",
    "legaltech",
    "nonprofit",
    "consulting",
  ];

  try {
    const prompt =
      `Extract 3-7 industry tags for this company based on their description. Follow these rules:\n\n` +
      `1. USE ONLY TAGS FROM THIS APPROVED TAXONOMY (lowercase snake_case):\n` +
      `${validTags.join(", ")}\n\n` +
      `2. ASSIGN 3-7 TAGS PER COMPANY:\n` +
      `   - 1-2 primary industry tags (what the company *is*)\n` +
      `   - 2-5 secondary tags (markets served, technologies used)\n\n` +
      `3. TAG BY FUNCTION, NOT JUST KEYWORDS:\n` +
      `   - Stripe → ["fintech", "payments", "developer_tools", "saas"]\n` +
      `   - Shopify → ["ecommerce", "retail", "saas", "developer_tools"]\n` +
      `   - Nike → ["consumer_goods", "retail", "sports", "fitness"]\n` +
      `   - LinkedIn → ["social_media", "recruiting", "saas", "enterprise_software"]\n` +
      `   - OpenAI → ["ai", "developer_tools", "saas"]\n` +
      `   - Twilio → ["telecommunications", "developer_tools", "saas"]\n` +
      `   - DoorDash → ["food_delivery", "marketplaces", "logistics"]\n` +
      `   - Stanford University → ["education", "higher_education", "research", "academia"]\n` +
      `   - Professor/Researcher → ["education", "research", "academia", "higher_education"]\n` +
      `   - Khan Academy → ["edtech", "education", "saas"]\n\n` +
      `4. IF THE DESCRIPTION MENTIONS AI, ALWAYS ADD "ai" AS A TAG.\n\n` +
      `5. DO NOT DUPLICATE TAGS.\n` +
      `6. DO NOT USE GENERIC TAGS LIKE "tech".\n` +
      `7. NEVER RETURN MORE THAN 7 TAGS.\n` +
      `8. ALWAYS PICK THE MOST SPECIFIC OPTION AVAILABLE.\n\n` +
      `Company name: ${companyName}\n` +
      `Company description: ${companySummary}\n` +
      `Company URL: ${companyUrl || "(not available)"}\n\n` +
      `Return ONLY a JSON array of tag strings, nothing else. Example: ["fintech", "payments", "developer_tools", "saas"]`;

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 100,
      temperature: 0.3,
    };

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAIApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("OpenAI API error for industry tags:", response.status, errorBody);
      return fallback;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (text) {
      // Clean up JSON response
      let cleanedText = text.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      try {
        const tags = JSON.parse(cleanedText);
        if (Array.isArray(tags) && tags.length > 0) {
          // Validate tags are strings and filter to valid industry tags
          const validTagSet = new Set(validTags);
          const processedTags = tags
            .filter((tag: any) => typeof tag === 'string')
            .map((tag: string) => tag.toLowerCase().trim().replace(/\s+/g, '_'))
            .filter((tag: string) => validTagSet.has(tag))
            .filter((tag: string, index: number, arr: string[]) => arr.indexOf(tag) === index); // Remove duplicates
          
          // Return 3-7 tags (enforce max)
          return processedTags.slice(0, 7);
        }
      } catch (parseError) {
        console.warn("Failed to parse industry tags JSON:", cleanedText, parseError);
      }
    }
  } catch (error) {
    console.error("OpenAI request failed for industry tags:", error);
  }

  return fallback;
}

serve(async (req) => {
  try {
    let body: { user_id?: string; force?: boolean } | null = null;
    try {
      body = await req.json();
    } catch {
      // No body, process all users
    }

    // Get all users with company_summary
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("user_id, company_name, company_summary, company_url, industry_tags")
      .not("company_summary", "is", null)
      .neq("company_summary", "");

    if (usersError) {
      console.error("Supabase select error:", usersError);
      return new Response(JSON.stringify({ error: usersError.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No users with company_summary found.",
          updated_count: 0,
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    console.log(`Found ${users.length} users with company_summary`);

    // Filter to specific user if provided
    const usersToProcess = body?.user_id
      ? users.filter((u) => u.user_id === body.user_id)
      : users;

    if (usersToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No matching users found.",
          updated_count: 0,
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    const updates: Array<{
      user_id: string;
      industry_tags: string[];
    }> = [];
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const user of usersToProcess) {
      processedCount++;
      
      // Skip if user already has tags and force is not set (unless body.force is true)
      if (!body?.force && user.industry_tags && Array.isArray(user.industry_tags) && user.industry_tags.length > 0) {
        console.log(`Skipping user ${user.user_id} - already has tags: ${JSON.stringify(user.industry_tags)}`);
        continue;
      }

      if (!user.company_summary) {
        console.log(`Skipping user ${user.user_id} - no company_summary`);
        continue;
      }

      try {
        const companyName = user.company_name || "Unknown Company";
        const tags = await extractIndustryTags(
          companyName,
          user.company_summary,
          user.company_url
        );

        if (tags && tags.length > 0) {
          updates.push({
            user_id: user.user_id,
            industry_tags: tags,
          });
          successCount++;
          console.log(`✅ Extracted tags for ${companyName}: ${JSON.stringify(tags)}`);
        } else {
          errorCount++;
          console.warn(`⚠️ No tags extracted for ${companyName}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing user ${user.user_id}:`, error);
      }
    }

    if (updates.length > 0) {
      console.log(`About to update ${updates.length} users with industry tags`);
      
      // Update in batches of 100
      const batchSize = 100;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        const { error: updateError } = await supabase
          .from("users")
          .upsert(batch, {
            onConflict: "user_id",
            returning: "minimal",
          });

        if (updateError) {
          console.error("Supabase update error:", updateError);
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 500,
            headers: JSON_HEADERS,
          });
        }
      }
    }

    console.log(`Processed ${processedCount} users, updated ${successCount}, errors ${errorCount}`);

    return new Response(
      JSON.stringify({
        message: "Industry tags updated",
        updated_count: updates.length,
        processed: processedCount,
        success: successCount,
        errors: errorCount,
        total_users: usersToProcess.length,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});

