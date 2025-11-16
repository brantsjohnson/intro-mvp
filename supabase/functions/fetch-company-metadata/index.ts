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

type UserRow = {
  user_id: string;
  company_url: string | null;
  company_name: string | null;
  company_summary: string | null;
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

function normalizeUrl(rawUrl: string): string {
  try {
    new URL(rawUrl);
    return rawUrl;
  } catch {
    const trimmed = rawUrl.trim();
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
    return `https://${withoutProtocol}`;
  }
}

function sanitizeDomain(domain: string): string {
  return domain.replace(/^www\./i, "");
}

function extractMeta(html: string, fallbackName: string) {
  let title = fallbackName;
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const rawTitle = titleMatch[1].trim();
    if (rawTitle) {
      const delimiters = ["|", "–", "-", "•", ":"];
      let cleanedTitle = rawTitle;
      for (const delimiter of delimiters) {
        if (cleanedTitle.includes(delimiter)) {
          cleanedTitle = cleanedTitle.split(delimiter)[0].trim();
          break;
        }
      }
      title = cleanedTitle || fallbackName;
    }
  }

  let metaDescription = "";
  const metaMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  );
  if (metaMatch && metaMatch[1]) {
    metaDescription = metaMatch[1].trim();
  }

  return { title, metaDescription };
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SupabaseEdgeFunction/1.0; +https://supabase.com)",
      },
    });

    if (!response.ok) {
      console.warn(`Non-200 response when fetching ${url}:`, response.status);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.warn(`Failed to fetch ${url}:`, error);
    return null;
  }
}

function cleanCompanyName(name: string): string {
  // Remove patterns like "Company: Tagline" or "Company - Tagline"
  // Keep only the part before colon or dash if it looks like a tagline
  let cleaned = name.trim();
  
  // Remove ": Text" patterns (e.g., "Shopify: The All" → "Shopify")
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    const firstPart = parts[0].trim();
    // Only use first part if it's short (likely company name)
    if (firstPart.length < 30 && firstPart.split(" ").length <= 4) {
      cleaned = firstPart;
    }
  }
  
  // Remove " - Tagline" patterns
  if (cleaned.includes(" - ")) {
    const parts = cleaned.split(" - ");
    const firstPart = parts[0].trim();
    if (firstPart.length < 30 && firstPart.split(" ").length <= 4) {
      cleaned = firstPart;
    }
  }
  
  // Remove "#1", "# 1", "The #1" patterns
  cleaned = cleaned.replace(/\s*#\s*\d+\s*/gi, "").trim();
  cleaned = cleaned.replace(/^The\s+#\d+\s+/i, "").trim();
  
  return cleaned;
}

function isValidCompanyNameInput(input: string): boolean {
  // Check if it's a URL with a space (user error like "apple .com")
  const trimmed = input.trim();
  if (trimmed.includes(" ") && (trimmed.includes(".com") || trimmed.includes(".net") || trimmed.includes(".org"))) {
    // Check if removing spaces makes it a valid URL pattern
    const withoutSpaces = trimmed.replace(/\s+/g, "");
    try {
      new URL(withoutSpaces.startsWith("http") ? withoutSpaces : `https://${withoutSpaces}`);
      return false; // It's a URL with spaces, not a company name
    } catch {
      // Not a valid URL even without spaces, so it's probably a company name
      return true;
    }
  }
  return true;
}

async function extractCompanyName(
  pageTitle: string,
  domain: string,
  metaDescription: string,
  htmlSnippet: string,
): Promise<string> {
  // Clean the title first
  let cleanedTitle = cleanCompanyName(pageTitle);
  
  // If title looks like a company name (short, capitalized, no verbs), use it
  const titleLower = cleanedTitle.toLowerCase();
  const isLikelyCompanyName = cleanedTitle.length < 30 && 
                               !titleLower.includes("power") &&
                               !titleLower.includes("platform") &&
                               !titleLower.includes("connect") &&
                               !titleLower.includes("your") &&
                               !titleLower.includes("business") &&
                               !titleLower.includes("website") &&
                               !titleLower.includes("home") &&
                               cleanedTitle.split(" ").length <= 4 &&
                               !cleanedTitle.includes(":");

  if (isLikelyCompanyName) {
    return cleanedTitle;
  }

  // Otherwise, use OpenAI to extract the actual company name
  try {
    const prompt =
      `Extract the actual company name from this website information. Return ONLY the company name, nothing else. No taglines, no descriptions, no colons.\n\n` +
      `Page title: ${pageTitle}\n` +
      `Domain: ${domain}\n` +
      `Meta description: ${metaDescription || "(not available)"}\n\n` +
      `Examples:\n` +
      `- "Power your entire business" → "Square"\n` +
      `- "One platform to connect" → "LinkedIn"\n` +
      `- "Shopify: The All" → "Shopify"\n` +
      `- "Salesforce: The #1 AI CRM" → "Salesforce"\n` +
      `- "Welcome to Nike" → "Nike"\n\n` +
      `Return just the company name, no colons, no taglines:`;

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 20,
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

    if (response.ok) {
      const data = await response.json();
      const extractedName = data?.choices?.[0]?.message?.content?.trim();
      if (extractedName && extractedName.length > 0 && extractedName.length < 50) {
        // Clean up any quotes, colons, or extra text
        let cleaned = extractedName.replace(/^["']|["']$/g, "").trim();
        cleaned = cleanCompanyName(cleaned);
        if (cleaned) {
          return cleaned;
        }
      }
    }
  } catch (error) {
    console.warn("Failed to extract company name with AI:", error);
  }

  // Fallback: use domain name
  const domainParts = domain.split(".");
  if (domainParts.length >= 2) {
    const mainDomain = domainParts[domainParts.length - 2];
    return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
  }

  return cleanCompanyName(pageTitle);
}

async function generateSummary(
  companyName: string,
  domain: string,
  metaDescription: string,
  htmlSnippet: string,
): Promise<string> {
  const fallback = `${companyName} is a technology company.`;

  try {
    const prompt =
      `Write a concise 1-2 sentence description of what ${companyName} offers or does as a company.\n\n` +
      `Requirements:\n` +
      `- Focus on what products, services, or solutions the company provides\n` +
      `- Do NOT describe the website itself (e.g., don't say "this is the website for...")\n` +
      `- Do NOT mention the domain or URL\n` +
      `- Be specific about their business offerings\n` +
      `- Keep it professional and factual\n\n` +
      `Company name: ${companyName}\n` +
      `Meta description from their website: ${metaDescription || "(not available)"}\n` +
      `Website content snippet:\n${htmlSnippet.slice(0, 1500)}`;

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 90,
      temperature: 0.7,
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
      console.error("OpenAI API error:", response.status, errorBody);
      return fallback;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (text) {
      return text;
    }
  } catch (error) {
    console.error("OpenAI request failed:", error);
  }

  return fallback;
}

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
    // Handle both batch processing (no body) and single user processing (with body)
    let body: { user_id?: string; company_url?: string; company_name?: string } | null = null;
    try {
      body = await req.json();
    } catch {
      // No body, process all users
    }

    let users: UserRow[];

    if (body?.user_id) {
      // Single user processing - get specific user
      const { data, error } = await supabase
        .from("users")
        .select("user_id, company_url, company_name, company_summary")
        .eq("user_id", body.user_id)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: JSON_HEADERS,
        });
      }
      users = [data];
    } else {
      // Batch processing - prioritize users with company_url but NULL summaries
      // First get users with URL but NULL summary
      const { data: nullSummaryUsers, error: nullError } = await supabase
        .from("users")
        .select("user_id, company_url, company_name, company_summary")
        .not("company_url", "is", null)
        .is("company_summary", null);
      
      // Then get all other users with company_url or company_name
      const { data: otherUsers, error: otherError } = await supabase
        .from("users")
        .select("user_id, company_url, company_name, company_summary")
        .or("company_url.not.is.null,company_name.not.is.null");
      
      if (nullError || otherError) {
        console.error("Supabase select error:", nullError || otherError);
        return new Response(JSON.stringify({ error: (nullError || otherError)?.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      
      // Combine and deduplicate by user_id, prioritizing null summary users
      const userMap = new Map<string, UserRow>();
      (nullSummaryUsers || []).forEach(u => userMap.set(u.user_id, u));
      (otherUsers || []).forEach(u => {
        if (!userMap.has(u.user_id)) {
          userMap.set(u.user_id, u);
        }
      });
      users = Array.from(userMap.values());
      
      console.log(`Found ${nullSummaryUsers?.length || 0} users with NULL summaries, ${users.length} total users to process`);
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No users with company_url found.",
          updated_count: 0,
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    console.log(`Found ${users.length} users with company_url`);

    const updates: Array<Partial<UserRow> & { user_id: string }> = [];
    let processedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      const updatePayload: Partial<UserRow> & { user_id: string } = {
        user_id: user.user_id,
      };

      // Case 1: User provided company_name but no URL - just validate and set it
      if (!user.company_url || user.company_url.trim() === "") {
        if (body?.company_name || user.company_name) {
          const providedName = body?.company_name || user.company_name;
          if (providedName && isValidCompanyNameInput(providedName)) {
            const cleanedName = cleanCompanyName(providedName);
            if (cleanedName && cleanedName.length > 0) {
              updatePayload.company_name = cleanedName;
              // No summary needed if just company name provided
              if (Object.keys(updatePayload).length > 1) {
                updates.push(updatePayload);
              }
            }
          }
        }
        continue;
      }

      // Case 2: User has company_url - process normally
      // Check if we need to update company_name or company_summary
      // Handle null, empty string, whitespace-only, or the literal "EMPTY" string
      const companyNameValue = user.company_name?.trim().toUpperCase() || "";
      const companySummaryValue = user.company_summary?.trim().toUpperCase() || "";
      
      // Check if company_name has ": Text" pattern (needs cleaning)
      const hasColonPattern = user.company_name?.includes(":") || false;
      
      // Also check if company_name looks like a tagline (needs fixing)
      const nameLower = user.company_name?.toLowerCase() || "";
      const looksLikeTagline = nameLower.includes("power") ||
                                nameLower.includes("platform") ||
                                nameLower.includes("connect") ||
                                nameLower.includes("your") ||
                                nameLower.includes("business") ||
                                nameLower.includes("entire") ||
                                (user.company_name && user.company_name.length > 25) ||
                                hasColonPattern;
      
      const needsCompanyName = !user.company_name || 
                               companyNameValue === "" || 
                               companyNameValue === "EMPTY" ||
                               companyNameValue === '""' ||
                               looksLikeTagline;
      
      // Check if summary is NULL, empty, or needs regeneration
      // IMPORTANT: Explicitly check for null, undefined, empty string, and "EMPTY"
      const summaryIsNull = user.company_summary === null || user.company_summary === undefined;
      const summaryIsEmpty = !summaryIsNull && (
        companySummaryValue === "" || 
        companySummaryValue === "EMPTY" ||
        companySummaryValue === '""' ||
        (user.company_summary && user.company_summary.trim().length === 0)
      );
      const needsCompanySummary = summaryIsNull || summaryIsEmpty;
      
      // Also check if summary contains tagline-like text (needs regeneration)
      // Be more specific - check if summary starts with tagline text (not just contains it)
      const summaryLower = user.company_summary?.toLowerCase() || "";
      const summaryContainsTagline = user.company_summary && (
        summaryLower.startsWith("power your entire") ||
        summaryLower.startsWith("one platform to connect") ||
        (summaryLower.includes("power your entire business offers") && !summaryLower.includes("square")) ||
        (summaryLower.includes("one platform to connect offers") && !summaryLower.includes("zoom") && !summaryLower.includes("linkedin"))
      );
      
      // CRITICAL: If user has company_url but NULL/empty summary, we MUST generate one
      const hasUrlButNoSummary = user.company_url && needsCompanySummary;
      const needsSummaryRegen = needsCompanySummary || summaryContainsTagline || hasUrlButNoSummary;
      
      // Log if we find NULL summaries
      if (summaryIsNull && user.company_url) {
        console.log(`⚠️ Found NULL summary for user ${user.user_id} with URL ${user.company_url} - will generate`);
      }

      // Log first few users for debugging
      if (processedCount + skippedCount < 3) {
        console.log(`User ${user.user_id}: name="${user.company_name}" (needs: ${needsCompanyName}), summary="${user.company_summary?.substring(0, 50)}..." (needs: ${needsSummaryRegen})`);
      }

      if (!needsCompanyName && !needsSummaryRegen) {
        skippedCount++;
        continue;
      }

      processedCount++;
      console.log(`Processing user ${user.user_id}: needsName=${needsCompanyName}, needsSummary=${needsCompanySummary}`);

      const normalizedUrl = normalizeUrl(user.company_url);
      let urlObj: URL;
      try {
        urlObj = new URL(normalizedUrl);
      } catch (error) {
        console.warn("Invalid URL for user:", user.user_id, normalizedUrl, error);
        continue;
      }

      const domain = sanitizeDomain(urlObj.hostname);
      const html = await fetchHtml(normalizedUrl);

      let pageTitle = domain;
      let metaDescription = "";
      if (html) {
        const extracted = extractMeta(html, domain);
        pageTitle = extracted.title;
        metaDescription = extracted.metaDescription;
      }

      // Extract the actual company name using AI if needed
        const condensedHtml = (html ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);
      
      // Only extract company name if we need to update it
      let companyName: string;
      if (needsCompanyName) {
        companyName = await extractCompanyName(pageTitle, domain, metaDescription, condensedHtml);
        // Clean it one more time to ensure no ": Text" patterns
        companyName = cleanCompanyName(companyName);
      } else {
        // Use existing company name if it's already correct, but clean it if it has colon pattern
        companyName = user.company_name || domain;
        if (hasColonPattern) {
          companyName = cleanCompanyName(companyName);
          // If cleaning changed it, we need to update
          if (companyName !== user.company_name) {
            updatePayload.company_name = companyName;
          }
        }
      }

      // Regenerate summary if needed (either missing, or contains tagline text, or company name was a tagline)
      // CRITICAL: Always regenerate if summary is NULL and user has URL
      const summaryNeedsRegen = needsSummaryRegen || (looksLikeTagline && user.company_summary) || (summaryIsNull && user.company_url);

      // CRITICAL: Always preserve existing values when updating
      // If we're updating company_name, preserve existing company_summary (unless it needs regeneration)
      // If we're updating company_summary, preserve existing company_name (unless it needs updating)
      if (needsCompanyName) {
        updatePayload.company_name = companyName;
        // Preserve existing summary if we're not regenerating it
        if (!summaryNeedsRegen && user.company_summary) {
          updatePayload.company_summary = user.company_summary;
        }
      }

      // ALWAYS generate summary if it's NULL and user has URL
      if (summaryNeedsRegen || (summaryIsNull && user.company_url)) {
        console.log(`Generating summary for user ${user.user_id} (summaryIsNull: ${summaryIsNull}, hasUrl: ${!!user.company_url})`);
        try {
          const summary = await generateSummary(
            companyName,
            domain,
            metaDescription,
            condensedHtml,
          );
          // Ensure summary is not empty string - use fallback if needed
          if (summary && summary.trim() !== "" && summary.trim() !== '""' && summary.trim().length > 10) {
            updatePayload.company_summary = summary.trim();
            console.log(`✅ Generated summary for ${companyName}: "${summary.trim().substring(0, 50)}..."`);
          } else {
            // Use a simple fallback instead of null to avoid infinite loops
            updatePayload.company_summary = `${companyName} is a technology company.`;
            console.log(`⚠️ Using fallback summary for ${companyName}`);
          }
        } catch (error) {
          console.error(`Failed to generate summary for ${companyName}:`, error);
          // Always set a fallback, never null
          updatePayload.company_summary = `${companyName} is a technology company.`;
        }
        
        // Preserve existing company_name if we're not updating it
        if (!needsCompanyName && user.company_name) {
          updatePayload.company_name = user.company_name;
        }
      } else if (summaryIsNull && user.company_url) {
        // Safety net: if we somehow didn't generate, force generate now
        console.log(`🚨 Safety net: Force generating summary for user ${user.user_id}`);
        const summary = await generateSummary(
          companyName,
          domain,
          metaDescription,
          condensedHtml,
        );
        updatePayload.company_summary = summary && summary.trim() !== "" && summary.trim().length > 10
          ? summary.trim()
          : `${companyName} is a technology company.`;
        // Preserve existing company_name
        if (!needsCompanyName && user.company_name) {
          updatePayload.company_name = user.company_name;
        }
      }

      // CRITICAL: Always include both fields in update to prevent clearing one when updating the other
      // If we're updating company_name, ensure company_summary is included (preserve existing or set new)
      if (updatePayload.company_name && !updatePayload.company_summary) {
        if (user.company_summary) {
          // Preserve existing summary
          updatePayload.company_summary = user.company_summary;
        } else if (user.company_url) {
          // Generate summary if missing
          console.log(`Generating missing summary for ${updatePayload.company_name}`);
          try {
            const summary = await generateSummary(
              updatePayload.company_name,
              domain,
              metaDescription,
              condensedHtml,
            );
            updatePayload.company_summary = summary && summary.trim() !== "" && summary.trim().length > 10
              ? summary.trim()
              : `${updatePayload.company_name} is a technology company.`;
          } catch (error) {
            updatePayload.company_summary = `${updatePayload.company_name} is a technology company.`;
          }
        }
      }
      
      // If we're updating company_summary, ensure company_name is included (preserve existing or set new)
      if (updatePayload.company_summary && !updatePayload.company_name) {
        if (user.company_name) {
          // Preserve existing company name
          updatePayload.company_name = user.company_name;
        } else if (user.company_url) {
          // Use extracted company name
          updatePayload.company_name = companyName;
        }
      }

      // Always ensure we have at least user_id in the payload
      if (Object.keys(updatePayload).length > 1) {
        // Log what we're updating
        console.log(`Updating user ${user.user_id}: name="${updatePayload.company_name || '(preserving)'}", summary="${updatePayload.company_summary?.substring(0, 50) || '(preserving)'}..."`);
        updates.push(updatePayload);
      }
    }

    if (updates.length > 0) {
      console.log(`About to upsert ${updates.length} users`);
      
      // For each update, extract industry_tags using AI if company_summary is being updated
      const updatesWithIndustryTags = await Promise.all(
        updates.map(async (update) => {
          // If we're updating company_summary, extract industry tags using AI
          if (update.company_summary) {
            try {
              const user = users.find(u => u.user_id === update.user_id);
              const companyName = update.company_name || user?.company_name || "";
              const companyUrl = user?.company_url || null;
              
              // Use AI to extract industry tags
              const aiTags = await extractIndustryTags(
                companyName,
                update.company_summary,
                companyUrl
              );
              
              if (aiTags && aiTags.length > 0) {
                console.log(`AI extracted industry tags for ${companyName}: ${JSON.stringify(aiTags)}`);
                return { ...update, industry_tags: aiTags };
              } else {
                // Fallback to SQL function if AI fails
                console.log(`AI returned no tags, trying SQL function for ${companyName}`);
                const { data: derivedTags, error: tagError } = await supabase.rpc(
                  "derive_industry_tags",
                  {
                    p_company_summary: update.company_summary,
                    p_company_name: companyName,
                    p_company_url: companyUrl,
                  }
                );
                
                if (!tagError && derivedTags && Array.isArray(derivedTags) && derivedTags.length > 0) {
                  console.log(`SQL derived industry tags for ${companyName}: ${JSON.stringify(derivedTags)}`);
                  return { ...update, industry_tags: derivedTags };
                }
              }
            } catch (error) {
              console.warn(`Failed to extract industry tags for user ${update.user_id}:`, error);
            }
          }
          return update;
        })
      );
      
      const { error: updateError } = await supabase
        .from("users")
        .upsert(updatesWithIndustryTags, {
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

    console.log(`Processed ${processedCount} users, skipped ${skippedCount}, updating ${updates.length}`);

    // Include sample data for debugging
    const sampleUsers = users.slice(0, 3).map(u => ({
      user_id: u.user_id,
      company_url: u.company_url,
      company_name: u.company_name,
      company_name_length: u.company_name?.length || 0,
      company_summary: u.company_summary?.substring(0, 50) || null,
      company_summary_length: u.company_summary?.length || 0,
    }));

    return new Response(
      JSON.stringify({
        message: updates.length > 0 ? "Company metadata updated" : "No users need company metadata",
        updated_count: updates.length,
        processed: processedCount,
        skipped: skippedCount,
        total_users: users.length,
        sample_users: sampleUsers,
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

