# Generate Match Explanations Edge Function

This Edge Function generates and updates match explanations for connections in the database. It's designed to be called independently from the matchmaker function, allowing you to iterate on explanation generation logic without re-running the entire matching process.

## Purpose

Separates explanation generation from match scoring/selection, enabling:
- Independent iteration on explanation copy/tone
- Regenerating explanations for existing matches
- A/B testing different explanation strategies
- Updating explanations when user profiles change

## Deployment

To deploy this function to Supabase:

```bash
supabase functions deploy generate-match-explanations --project-ref YOUR_PROJECT_REF
```

Or if you're using the Supabase CLI and have linked your project:

```bash
supabase functions deploy generate-match-explanations
```

## API Usage

### Endpoint
`POST /functions/v1/generate-match-explanations`

### Request Body

```json
{
  "event_id": "required-event-id",
  "user_ids": ["optional", "user", "ids"],
  "connection_ids": ["optional", "connection", "ids"],
  "force": false,
  "options": {
    "maxWords": 30,
    "buyerRoleWeight": true,
    "allowSharedHobby": true
  }
}
```

### Parameters

- `event_id` (required): The event ID to generate explanations for
- `user_ids` (optional): Array of user IDs to filter connections. If provided, only connections involving these users will be processed.
- `connection_ids` (optional): Array of connection IDs to process (not yet fully implemented)
- `force` (optional, default: false): If true, regenerates explanations even if they already exist
- `options` (optional): Configuration for explanation generation
  - `maxWords`: Maximum words in explanation (default: 30)
  - `buyerRoleWeight`: Whether to weight buyer roles higher (default: true)
  - `allowSharedHobby`: Whether to include shared hobbies (default: true)

### Response

```json
{
  "ok": true,
  "updated": 15,
  "skipped": 3,
  "total": 18,
  "runtime_ms": 1234
}
```

## Examples

### Generate explanations for all connections in an event

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-match-explanations \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "your-event-id"
  }'
```

### Regenerate explanations for specific users

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-match-explanations \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "your-event-id",
    "user_ids": ["user-id-1", "user-id-2"],
    "force": true
  }'
```

### Customize explanation options

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-match-explanations \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "your-event-id",
    "options": {
      "maxWords": 50,
      "buyerRoleWeight": false,
      "allowSharedHobby": true
    }
  }'
```

## Integration with Matchmaker

The matchmaker function still generates basic explanations when creating matches. This function can be called afterward to:
1. Replace basic explanations with more sophisticated ones
2. Update explanations when user profiles change
3. Regenerate explanations with different options/strategies

## Event Configuration

You can configure default explanation options in the event's `matching_config`:

```json
{
  "explanation": {
    "max_words": 30,
    "buyer_role_weight": true,
    "allow_shared_hobby": true
  }
}
```

These will be merged with any options provided in the API request.


