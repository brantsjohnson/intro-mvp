-- Create table to store AI-determined industries for companies
CREATE TABLE IF NOT EXISTS company_industries (
  company_name TEXT PRIMARY KEY,
  industry TEXT NOT NULL,
  determined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_industries_company_name ON company_industries(company_name);

-- Add comment
COMMENT ON TABLE company_industries IS 'Stores AI-determined industries for companies based on company descriptions';

