# ElevenLabs conversations to delete (test traffic, 2026-09-11)

The dashboard's Voice Calls tab reads conversations straight from ElevenLabs.
The DB half of the clean-up is done (`voice_calls` and `callback_queue` keep
only the five below); these twenty still need deleting in ElevenLabs.

The API key in `voice-agent/.env.local` is not admin-scoped — every
`DELETE /v1/convai/conversations/{id}` answered `403 admin role is required`.
Either delete them in the ElevenLabs UI (Conversational AI → Conversations,
filter agent Rise & Shine, multi-select) or mint an admin key and run
`scripts/elevenlabs-delete-conversations.mts`.

## KEEP (the five best: qualified, successful, destination captured)

- conv_6401m07f4jpxey0v15e6qcskfxnr — Adnan Barwaniwala · Bali · 1m53s
- conv_6601m20ygs4keq7v5sfqss6q2txz — Patel Hardik · Kerala · 1m29s
- conv_1701m0t9yyzcfvsb10m0q29ksb5r — Ankita patel · Dubai · 1m22s
- conv_9801m0sgyk72e4dvswj5zcxvc7tb — Alpesh · Maldives · 1m21s
- conv_6701m0srvrb2fbm8c4ry2ce924vr — Khush · Bali · 1m17s

## DELETE

- conv_1101m07dkwvtejrspsbsyzkbt7a1
- conv_4901m1xt3gy6fsc8ce2kp2vvk6zm
- conv_6901m079npbge62vc7q9dmcgkjhd
- conv_5901m07dfe3req7sgw4tk7j6keyn
- conv_0601m07b2pfyfj7rbsn4mewcryrw
- conv_4201m07d7h6gf5cbn2yeazvwafaw
- conv_5701m07dgn9hf5p8d42qwbjg8a8a
- conv_7301m07bpevne5srbhqwxgzxxqr9
- conv_5601m07cvp9aehf90qgn3ta0c7cd
- conv_1601m07cs94qe2dtxnc9mswdzaeb
- conv_9201m079sct0ev0s9s1fqr7vzbsy
- conv_8101m07eek7gfq8sk8wtwh7qe551
- conv_5901m07bmwsne2crbmzm5y4swb7q
- conv_3901m07d5zr4fec8znyqxqt7a6qk
- conv_4901m07dj7q3evnrjnzrvnz4d57r
- conv_3301m0vq7sz3fyqae4jqhh9nfzhw
- conv_4201m07e98m3ff98kamkp7h3czpr
- conv_8401m1xddp6ked0ae4m652w3jhws
- conv_0201m07ctyevftcvg8qg4ac3wp94
- conv_2801m0wndyhyfs8r274q9brdm1db
