const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
 {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

router.post('/', require('../middleware/auth'), async (req, res) => {
  const { cvText, jobDescription } = req.body;
  if (!cvText || !jobDescription) {
    return res.status(400).json({ error: 'CV and job description required' });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, screenings_used, screenings_limit')
    .eq('id', req.user.id)
    .single();
  if (profile.screenings_limit !== null &&
      profile.screenings_used >= profile.screenings_limit) {
    return res.status(403).json({
      error: 'Screening limit reached',
      upgradeRequired: true,
      plan: profile.plan
    });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a senior talent acquisition expert. Analyse this CV against the job description. Return ONLY valid JSON, no markdown.

CV:
${cvText}

Job Description:
${jobDescription}

Return exactly:
{
  "candidateName": "full name from CV",
  "overallScore": <0-100>,
  "breakdown": {
    "technicalSkills": <0-100>,
    "experience": <0-100>,
    "education": <0-100>,
    "roleAlignment": <0-100>,
    "cultureFit": <0-100>
  },
  "strengths": ["strength1","strength2","strength3","strength4"],
  "weaknesses": ["gap1","gap2","gap3"],
  "interviewFocus": ["area1","area2","area3"],
  "notableSkills": ["skill1","skill2","skill3","skill4","skill5"],
  "summary": "3 sentence recruiter-facing summary."
}`
        }]
      })
    });
    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());
    await supabase.from('profiles')
      .update({ screenings_used: profile.screenings_used + 1 })
      .eq('id', req.user.id);
    await supabase.from('screenings').insert({
      user_id: req.user.id,
      candidate_name: result.candidateName,
      score: result.overallScore,
      result: result,
      job_snippet: jobDescription.slice(0, 200)
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Screening failed. Please try again.' });
  }
});

module.exports = router;
