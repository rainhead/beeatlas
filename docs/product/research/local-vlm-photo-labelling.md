# Local vision-language models for multi-label view and body-part labelling of macro bee photographs

**Research question:** BeeAtlas needs to label 1,088 macro bee photographs, once each, with a
single-valued camera **angle** (dorsal / lateral / ventral / frontal / oblique) and a **multi-label**
set of body parts that are *legible* — resolved well enough to identify the bee from, not merely
present in frame (whole-animal, head, wing, abdomen, legs, scopa/corbicula). The runner is LM Studio
over its OpenAI-compatible endpoint at `localhost:1234`; the hardware is a 16 GB M1 MacBook Air
(8-core GPU, 68 GB/s) and a desktop with an 8 GB NVIDIA Quadro P4000 (Pascal, 243 GB/s). Two models
are already on disk — `zai-org/glm-4.6v-flash` (9B, reasoning, **43.8 s/image**) and `gemma-4-e4b-it`
(non-reasoning, **1.3–1.7 s/image**) — but both were chosen because they happened to be there. What
does a *deliberate* choice look like, given that a candidate must have a GGUF or MLX build that
actually loads in LM Studio today, must not burn hundreds of reasoning tokens per one-word answer,
and must be constrainable to a JSON schema?

---

## Summary / recommendation

**Two premises in the question turned out to be wrong. I measured them on this machine while writing
this note — the runs are in the next section — and they change the shape of the answer.**

- **`gemma-4-e4b-it` is not the 1.3–1.7 s/image option under this task's prompt and schema — it is
  a ~90–110 s/image option**, because it spends ~580–650 reasoning tokens per photo. Whatever produced
  the 1.3–1.7 s figure was not this workload.
- **LM Studio has a working reasoning kill-switch, and it is `reasoning_effort: "none"`, not
  `chat_template_kwargs`.** With it, the same model drops to **10.6 s/image mean (n=5)** and 0 reasoning
  tokens. `chat_template_kwargs: {"enable_thinking": false}` is accepted without error and **silently
  ignored**. This single parameter is worth more than any model swap.
- **Structured output does compose with image input in LM Studio** — verified, valid schema-conforming
  JSON, no sentinels to strip.
- **But with reasoning off, `gemma-4-e4b-it` answered `"dorsal"` for all 5 photos.** Degenerate. And
  its prompt token count for a 512 px photo was only **111–139 tokens total including the text**, which
  means the image is being encoded at roughly Gemma 4's **lowest** documented visual token budget (70).
  It is being asked to judge fine detail from an image it has barely been shown.

**So: download three models and pilot them against the same n≈30 hand-labelled photos, and pass
`reasoning_effort: "none"` on every call.**

- **Primary: `Qwen/Qwen3-VL-8B-Instruct-GGUF` (Q4_K_M, 5.03 GB + 0.75 GB mmproj).** It is the only
  strong candidate that is non-reasoning *by construction* rather than by configuration — Qwen ships
  Instruct and Thinking as **separate checkpoints**, so there is no template flag to get wrong and no
  `<think>` block to strip. Its architecture is explicitly built for the failure mode this task has
  (DeepStack "fuses multi-level ViT features to capture fine-grained details"), and it emits boxes and
  points natively if per-part localization is ever wanted.
  ([model card](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct),
  [Qwen3-VL repo](https://github.com/QwenLM/Qwen3-VL))
- **Speed floor and the only comfortable fit on the P4000: `Qwen/Qwen3-VL-4B-Instruct-GGUF`
  (Q4_K_M, 2.50 GB + 0.45 GB mmproj).** Total ~2.95 GB leaves real room in 8 GB for KV cache, the
  vision tower and the CUDA context. Run it as the throughput baseline; if it matches the 8B on the
  pilot, the whole batch finishes in well under an hour.
- **Accuracy ceiling probe: `lmstudio-community/Qwen3.5-9B-GGUF` (Q4_K_M, 5.63 GB + 0.92 GB mmproj).**
  Qwen3.5 posts the best fine-grained-perception numbers of anything in this size class by a wide
  margin — **VlmsAreBlind 93.7** vs 72.5 for Qwen3-VL-30B-A3B, **V\* 90.1**, **CountBench 97.2**,
  **OCRBench 89.2** ([Qwen3.5-9B card](https://huggingface.co/Qwen/Qwen3.5-9B)). Those are the closest
  published proxies for "can this model resolve a small detail in a big picture." Two caveats: it is
  thinking-by-default (so `reasoning_effort: "none"` is mandatory, and **untested on this
  architecture**), and the published numbers were almost certainly measured *with* thinking on, so its
  non-thinking accuracy is unknown. Treat it as the experiment, not the default.
- **Do not add Gemma 4 12B, and treat `gemma-4-e4b-it` as a failed candidate rather than a floor.**
  Google publishes **no fine-grained-perception benchmark for the Gemma 4 family** — the vision row is
  MMMU Pro, OmniDocBench, MATH-Vision and MedXPertQA MM, all of which reward reasoning over acuity
  ([Gemma 4 card](https://huggingface.co/google/gemma-4-12B-it)). The measured `dorsal`-5/5 collapse is
  what that evidence gap looks like in practice. The family's one remaining lead is the visual token
  budget (§4); if LM Studio does not expose it, spend the download budget on the Qwen line.
- **On the alternatives: a detector is not a better labeller, but it is the only honest *instrument*.**
  A generative VLM's legibility judgement is unauditable and untunable. OWLv2 boxes plus a classical
  sharpness measure give a threshold you can *move*. But open-vocabulary detectors are documented to
  degrade sharply at part level and on fine-grained distinctions, and "scopa" is not in any detector's
  effective vocabulary. Use OWLv2 as a **calibration check on 3 labels** (head, wing, whole-animal),
  not as the pipeline. CLIP/SigLIP ranking is the weakest of the three options and should not be built.
- **After `reasoning_effort`, the next throughput lever is concurrency, not model size.** LM Studio's
  **Max Concurrent Predictions** (default 4) batches requests on one model load
  ([parallel requests](https://lmstudio.ai/docs/app/advanced/parallel-requests)), and mlx-engine v1.8.1
  added parallel predictions specifically for vision models
  ([LM Studio 0.4.13](https://lmstudio.ai/changelog/lmstudio-v0.4.13)). A batch of 1,088 is exactly the
  workload this exists for. Try it before trading accuracy for speed.

---

## Measured on this machine, 2026-08-06

These are the only numbers in this note that are observations rather than citations. They were taken
against the running LM Studio server at `localhost:1234` with the already-installed `gemma-4-e4b-it`,
over real 512 px bee photos from the existing pilot pool
(`scratchpad/photo-pilot/images/*-512.jpg`), using the multi-label schema this task actually needs
(`angle` enum + `legible_parts` array-of-enum, `strict: true`). Every run used `temperature: 0` and
`max_tokens: 1200`.

**Finding 1 — structured output works with vision input. Verified.** Every request returned valid JSON
conforming to the schema, in `choices[0].message.content`, with no wrapper text and no sentinels. This
closes the documentation gap noted in §5: LM Studio documents neither image input nor the vision
interaction for `response_format`, but the composition works.

**Finding 2 — `gemma-4-e4b-it` reasons by default, and it is expensive.**

| photo | wall time | prompt tokens | completion tokens | **reasoning tokens** |
| --- | --- | --- | --- | --- |
| 153241745 (cold, includes model load) | 198.6 s | 128 | 666 | 604 |
| 177646304 | 87.7 s | 117 | 644 | 583 |
| 217816412 | 88.1 s | 139 | 696 | 642 |
| 320074236 | 111.4 s | 117 | 704 | 650 |

Warm mean ≈ **96 s/image → ~29 hours for 1,088 photos**, which is *worse* than the GLM-4.6V-Flash
figure the model was supposed to be the fast alternative to. **The premise that this model is the
1.3–1.7 s/image option does not hold for this prompt and schema.** Gemma 4's card explains the
mechanism — thinking is triggered by a `<|think|>` token at the start of the system prompt
([card](https://huggingface.co/google/gemma-4-12B-it)) — so something in LM Studio's default template
for this model is supplying it.

**Finding 3 — the kill-switch is `reasoning_effort: "none"`. `chat_template_kwargs` is silently
ignored.** Same photo, same schema, three ways:

| request | wall time | completion | reasoning tokens | effect |
| --- | --- | --- | --- | --- |
| `chat_template_kwargs: {"enable_thinking": false}` | 111.4 s | 707 | 646 | **no error, no effect** |
| explicit empty `system` message | 113.3 s | 703 | 642 | no effect |
| **`reasoning_effort: "none"`** | **10.1 s** | **51** | **0** | **works** |

This answers the note's biggest open question empirically, and it answers it *against* the mechanism
the model cards document. `chat_template_kwargs` is the vLLM/SGLang convention that Qwen's card
prescribes; LM Studio accepts the field and drops it on the floor. `reasoning_effort` is LM Studio's
own parameter — it first appears in the
[API changelog](https://lmstudio.ai/docs/developer/api-changelog) for 0.3.23 (2025-08-12), scoped there
to `openai/gpt-oss-20b`, and has evidently been generalised since. **It is not listed on the
[chat-completions parameter page](https://lmstudio.ai/docs/developer/openai-compat/chat-completions),
so it is undocumented-but-working.** Whether it also works for Qwen3.5 is **untested** — but it is now
the first thing to try, ahead of the prompt-template surgery described in §3.

**Finding 4 — with reasoning off, this model collapses.** Five consecutive photos,
`reasoning_effort: "none"`:

| photo | wall time | prompt tokens | completion | answer |
| --- | --- | --- | --- | --- |
| 153241745 | 15.2 s | 122 | 51 | `dorsal` — head, abdomen, legs, wing |
| 177646304 | 8.4 s | 111 | 51 | `dorsal` — head, abdomen, legs, wing |
| 217816412 | 10.9 s | 133 | 46 | `dorsal` — head, abdomen, legs |
| 320074236 | 9.4 s | 111 | 46 | `dorsal` — head, abdomen, legs |
| 372705740 | 9.1 s | 122 | 46 | `dorsal` — head, abdomen, legs |

**Mean 10.6 s/image → 3.2 hours for 1,088 photos.** But `angle` is `"dorsal"` 5/5 and `legible_parts`
takes only two distinct values across five different photographs. That is a **degenerate labeller**,
not a fast one — and note that the same model chose `oblique` and `ventral` when it was allowed to
reason. Whatever discrimination it has lives in the reasoning tokens.

**Finding 5 — the image is barely being shown to the model.** `prompt_tokens` is **111–139 for the
whole request**, text included. The text prompt alone is ~25 tokens, so the 512 px photograph is
occupying roughly **70–110 tokens**. Gemma 4's supported visual token budgets are **70 / 140 / 280 /
560 / 1120**, and the card is explicit that *"a higher token budget preserves more visual detail…
a lower budget enables faster inference for tasks that don't require fine-grained understanding"*
([card](https://huggingface.co/google/gemma-4-12B-it)). **This measurement is consistent with the
lowest budget being in force**, which for a legibility task is close to the worst possible default. I
could not find where LM Studio exposes this setting; if it can be raised to 1120, Gemma 4 deserves one
more run before being written off. For comparison, Qwen3-VL / Qwen3.5 encode a 512×512 image as **256
visual tokens** by construction (`patch_size 16`, `spatial_merge_size 2`, verified from the GGUF
header) — 2–4× more of the picture, with no setting to get wrong.

**What these five findings do to the recommendation:** they do not change which models to try, but they
change the order of operations. Fix `reasoning_effort` first, then compare models on accuracy at
roughly equal speed — because the speed axis the original question was organised around turns out to be
a *configuration* axis, not a model-choice axis.

---

## 1. Verification method, and what "usable" means here

Everything below was checked against live sources on **2026-08-06**, because several months of model
releases have happened since the assistant's May 2026 cutoff and recall is not admissible evidence for
"does a build exist."

Three checks were applied to every candidate, in this order:

1. **Does llama.cpp upstream support the architecture?** Read from
   [`src/llama-arch.cpp`](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-arch.cpp)
   (LLM side) and
   [`tools/mtmd/clip-impl.h`](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/mtmd/clip-impl.h)
   (vision projector side) at `master`. Verified present: `qwen3vl`, `qwen3vlmoe`, `qwen35`,
   `qwen35moe`, `gemma4`, and projector types `PROJECTOR_TYPE_QWEN3VL`, `PROJECTOR_TYPE_GEMMA4V`.
   **Not present: any LocateAnything/Eagle architecture** — see §7.
2. **Does a GGUF actually ship an `mmproj`?** A repo tagged `image-text-to-text` proves nothing; the
   vision projector is a separate file and both halves are required
   ([llama.cpp multimodal docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)).
   File listings were pulled from the HuggingFace API per repo.
3. **What projector does the mmproj actually declare?** For Qwen3.5 — which has no dedicated projector
   type in llama.cpp — the GGUF header was parsed directly over HTTP range requests. Result:
   `clip.projector_type = qwen3vl_merger`, `clip.vision.image_size = 768`, `patch_size = 16`,
   `spatial_merge_size = 2`, 456M-parameter vision tower. **Qwen3.5's vision path reuses the Qwen3-VL
   merger, which is why it works on stock llama.cpp.** This is the single most load-bearing check in
   the note and it is not stated on any model card.

For the MLX side, LM Studio's engine is [`mlx-engine`](https://github.com/lmstudio-ai/mlx-engine),
which is built on [`mlx-vlm`](https://github.com/Blaizzy/mlx-vlm) (pinned to a git SHA in
`requirements.txt`). `mlx-vlm/mlx_vlm/models/` currently contains 168 architectures including
`qwen3_vl`, `qwen3_vl_moe`, `qwen3_5`, `qwen3_5_moe`, `gemma4`, `gemma4_unified`, `locateanything`,
`molmo_point`, `moondream3`, `sam3`. mlx-engine's own
[`tests/test_vision_models.py`](https://raw.githubusercontent.com/lmstudio-ai/mlx-engine/main/tests/test_vision_models.py)
exercises `lmstudio-community/Qwen3-VL-4B-Instruct-MLX-4bit`,
`lmstudio-community/Qwen3-VL-30B-A3B-Instruct-MLX-4bit`, `lmstudio-community/Qwen3.5-2B-MLX-4bit`,
`lmstudio-community/Qwen3.5-35B-A3B-MLX-4bit` and `lmstudio-community/gemma-4-E2B-it-MLX-4bit` — a
concrete, first-party list of what LM Studio actually tests on the MLX path.

**Stale-documentation warning:** the mlx-engine README's "Currently supported vision models" list still
names Llama-3.2-Vision, Pixtral, Qwen2-VL and Llava-v1.6, which is far behind its own test suite. Do
not use that README to rule a model out.

## 2. The shortlist

Sizes are exact file sizes read from the HuggingFace tree API, not estimates. GGUF totals are
**LLM + mmproj**, because you need both.

| Candidate | Params | GGUF (LM Studio, llama.cpp) | GGUF total | MLX (LM Studio, mlx-engine) | 16 GB Air | 8 GB P4000 | Reasoning |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Qwen3-VL-4B-Instruct** | 4B | `Qwen/Qwen3-VL-4B-Instruct-GGUF` → `Qwen3VL-4B-Instruct-Q4_K_M.gguf` 2.50 GB + `mmproj-…-Q8_0.gguf` 0.45 GB | **2.95 GB** | `lmstudio-community/Qwen3-VL-4B-Instruct-MLX-4bit` (3.11 GB); 5/6/8-bit also published | yes, easily | **yes, comfortably** | **No** — separate Thinking checkpoint |
| **Qwen3-VL-8B-Instruct** | 8B | `Qwen/Qwen3-VL-8B-Instruct-GGUF` → `Qwen3VL-8B-Instruct-Q4_K_M.gguf` 5.03 GB + `mmproj-…-Q8_0.gguf` 0.75 GB | **5.78 GB** | `lmstudio-community/Qwen3-VL-8B-Instruct-MLX-4bit` (5.78 GB); 5/6/8-bit also published | yes | tight (~5.8 GB weights in 8 GB) | **No** — separate Thinking checkpoint |
| **Qwen3.5-4B** | 4B | `lmstudio-community/Qwen3.5-4B-GGUF` → `Qwen3.5-4B-Q4_K_M.gguf` 2.71 GB + `mmproj-Qwen3.5-4B-BF16.gguf` 0.68 GB | **3.39 GB** | `lmstudio-community/Qwen3.5-4B-MLX-4bit` (3.06 GB), `-MLX-8bit` | yes, easily | **yes** | **Yes, on by default** — disable via `enable_thinking=false` |
| **Qwen3.5-9B** | 9B | `lmstudio-community/Qwen3.5-9B-GGUF` → `Qwen3.5-9B-Q4_K_M.gguf` 5.63 GB + `mmproj-Qwen3.5-9B-BF16.gguf` 0.92 GB | **6.55 GB** | `lmstudio-community/Qwen3.5-9B-MLX-4bit` (5.98 GB), `-MLX-8bit` | yes | **no** — 6.55 GB leaves too little for KV + context | **Yes, on by default** |
| *(control)* **Gemma 4 12B Unified** | 11.95B | `lmstudio-community/gemma-4-12B-it-QAT-GGUF` → `gemma-4-12B-it-QAT-Q4_0.gguf` 6.98 GB + `mmproj-…-BF16.gguf` 0.18 GB | **7.16 GB** | `lmstudio-community/gemma-4-12B-it-MLX-4bit` (+5/6/8-bit) | yes | no | card says opt-in; **assume on in LM Studio** — see Finding 2 |
| *(incumbent)* **gemma-4-E4B-it** | 4.5B effective / 8B total | `lmstudio-community/gemma-4-E4B-it-GGUF` → `Q4_K_M` 5.34 GB + `mmproj` 0.99 GB | 6.33 GB | `lmstudio-community/gemma-4-E4B-it-MLX-4bit` (6.86 GB) | yes | no | **Yes in practice** — ~600 reasoning tokens/image, measured |

LM Studio catalog shorthands (`lms get <id>`), verified on [lmstudio.ai/models](https://lmstudio.ai/models):
`qwen/qwen3-vl-2b|4b|8b|30b|32b`, `qwen/qwen3.5-2b|4b|9b|27b|35b-a3b`,
`google/gemma-4-e2b|e4b|12b|26b-a4b|31b`. The catalog resolves a default variant per your hardware;
`lms get --gguf` / `--mlx` forces the format and `--select` opens variant selection
(`lms get --help`, CLI commit `71bd99c`, installed locally). **For an unambiguous download, prefer the
full HuggingFace repo id** — the catalog shorthand does not distinguish Qwen3-VL *Instruct* from
*Thinking*, and that distinction is the whole point (§3).

### Explicitly out of reach

- **Qwen3.6-27B** — the current top of the local dense line, and its GGUF *is* vision-capable
  (`lmstudio-community/Qwen3.6-27B-GGUF` ships `mmproj-Qwen3.6-27B-BF16.gguf`, projector
  `qwen3vl_merger`, verified by header parse). But `Qwen3.6-27B-Q4_K_M.gguf` is **16.55 GB** — larger
  than the Air's entire unified memory. Not a candidate on this hardware.
- **Qwen3-VL-30B-A3B / Qwen3.5-35B-A3B** — MoE, ~18–21 GB at 4-bit. Same problem.
- **Nemotron-3-Nano-Omni-30B-A3B-Reasoning** — reasoning is in the checkpoint name, and 30B-A3B at
  Q4 does not fit. Interesting only because NVIDIA states LocateAnything's grounding was folded into it
  (§7).

## 3. Reasoning — the decisive axis, and how each candidate is controlled

The measured penalty on this exact task is ~30× (43.8 s vs 1.3–1.7 s per image). Nothing else in this
note matters as much. Three different control mechanisms are in play and they are not equivalent.

**Qwen3-VL — controlled by checkpoint, which is the safest form.** Qwen ships
`Qwen3-VL-8B-Instruct` and `Qwen3-VL-8B-Thinking` as distinct repositories, described on the card as
"Instruct and reasoning-enhanced Thinking editions"
([card](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)). Download the Instruct repo and there is no
reasoning to disable, no chat-template kwarg to plumb through LM Studio, and no `<think>` block in the
output. This is why it is the primary recommendation despite Qwen3.5 having better paper numbers.

**Qwen3.5 — controlled by a chat-template flag, which is the risky form.** The card is explicit:
*"Qwen3.5 models operate in thinking mode by default, generating thinking content signified by
`<think>\n...</think>\n\n`"*, disabled by `"chat_template_kwargs": {"enable_thinking": False}`
([card](https://huggingface.co/Qwen/Qwen3.5-9B)). Reading
[`chat_template.jinja`](https://huggingface.co/Qwen/Qwen3.5-9B/raw/main/chat_template.jinja) directly
shows the mechanism at lines 149–152: when `enable_thinking is false` the template emits a
**pre-closed empty block** `<think>\n\n</think>\n\n` before generation; otherwise it emits a bare
`<think>\n`, which *forces* the model into reasoning.

The problem is the last mile, and **it is now measured: LM Studio silently ignores
`chat_template_kwargs`.** It is absent from the documented parameter set — `model`, `messages`,
`temperature`, `top_p`, `top_k`, `max_tokens`, `stream`, `stop`, `presence_penalty`,
`frequency_penalty`, `logit_bias`, `repeat_penalty`, `seed`
([chat completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions)) — and sending
it produces no error and no behavioural change (Finding 3). So the mechanism Qwen's card prescribes is
unavailable here.

Two workarounds, in order of preference:

1. **`reasoning_effort: "none"`**, which is measured to work on Gemma 4 in this build (Finding 3),
   is LM Studio's own parameter, and requires no per-model setup. **Untested on Qwen3.5** — try it
   first, and check `usage.completion_tokens_details.reasoning_tokens` in the response to confirm it
   took effect rather than trusting the wall clock.
2. **Per-model Prompt Template override** (My Models → ⚙ → 🧪 Advanced Configuration → Prompt
   Template), which accepts a Jinja template
   ([prompt template docs](https://lmstudio.ai/docs/app/advanced/prompt-template)). Paste Qwen3.5's
   template with lines 149–152 edited to unconditionally emit the pre-closed
   `<think>\n\n</think>\n\n` block. Five minutes, and it cannot be forgotten on a per-request basis.

Either way, **verify by token accounting, not by stopwatch** — `reasoning_tokens` in the usage object
is the ground truth, and it is what caught this in the first place.

**Gemma 4 — controlled by a system-prompt token, and the card says the default is off. In LM Studio
it is on.** The card: *"Thinking is enabled by including the `<|think|>` token at the start of the
system prompt. To disable thinking, remove the token."*
([Gemma 4 card, §Thinking Mode Configuration](https://huggingface.co/google/gemma-4-12B-it)).
**Finding 2 shows `gemma-4-e4b-it` in LM Studio emitting ~600 reasoning tokens per image regardless**,
including when an explicit empty system message is supplied — so LM Studio's bundled template is
inserting the token. `reasoning_effort: "none"` overrides it; nothing else tried did.

A second wrinkle worth knowing for the larger variants: *"For all models except for the E2B and E4B
variants, if thinking is disabled, the model will still generate the tags but with an empty thought
block"* (same card) — so a 12B/26B/31B Gemma 4 will emit empty `<think></think>` tags that a strict
JSON-schema constraint may or may not tolerate.

**GLM-4.6V-Flash — reconsider it, but only after trying `reasoning_effort`.** LM Studio's catalog
listing for `glm-4.6v-flash` reports it as non-reasoning, which the measured 150–566 reasoning tokens
contradict — and the catalog makes the identical mistake for Gemma 4, which Finding 2 shows reasoning
heavily. **The `reasoning_effort: "none"` result on Gemma 4 means "there is no way to turn GLM's
reasoning off" is no longer a safe assumption.** It costs one request to check. That said, it was
picked by accident, its `<|begin_of_box|> … <|end_of_box|>` sentinels are a chat-template convention
rather than something a flag removes (though a JSON schema makes them unrepresentable — §5), and
nothing in the published evidence suggests it beats Qwen3-VL at this task. Check it; don't build on it.

**A general warning the measurements support: do not trust the LM Studio catalog's reasoning column.**
It reports both `gemma-4` and `glm-4.6v-flash` as non-reasoning
([lmstudio.ai/models](https://lmstudio.ai/models)); both demonstrably reason. The authoritative test is
`usage.completion_tokens_details.reasoning_tokens` on a real request.

**One more control worth knowing about, if a thinking model turns out to be necessary:** mlx-vlm
implements a **thinking budget** (`--thinking-budget`, plus `--thinking-start-token` /
`--thinking-end-token`) that forces `\n</think>` once the budget is exceeded
([mlx-vlm README](https://github.com/Blaizzy/mlx-vlm/blob/main/README.md)). **I could not verify that
LM Studio exposes this through mlx-engine** — it is not in LM Studio's API docs — so treat it as a
reason to consider driving mlx-vlm directly if Qwen3.5-with-thinking proves necessary, not as an
LM Studio feature.

## 4. Fine-grained visual grounding — the evidence that actually bears on legibility

Generic VQA leaderboards are close to useless here. The question "is this wing sharp enough to trace
venation from" is a **visual acuity** question, and the benchmarks that measure acuity are
`VlmsAreBlind` (low-level perceptual tasks that humans find trivial and VLMs fail),
`V*` (fine-grained visual search for small objects in high-resolution scenes), `CountBench`,
`RefCOCO` (referring-expression grounding) and OCR-family benchmarks. Qwen publishes all of them for
Qwen3.5; Google publishes none of them for Gemma 4; Qwen publishes Qwen3-VL's results **only as
rendered chart images** with no numeric table.

From the [Qwen3.5-9B model card](https://huggingface.co/Qwen/Qwen3.5-9B) (its own comparison table,
so read it as vendor-reported):

| Benchmark | What it measures | GPT-5-Nano | Gemini-2.5-Flash-Lite | Qwen3-VL-30B-A3B | **Qwen3.5-9B** | **Qwen3.5-4B** |
| --- | --- | --- | --- | --- | --- | --- |
| **VlmsAreBlind** | low-level perceptual acuity | 66.7 | 68.4 | 72.5 | **93.7** | **92.6** |
| **V\*** | fine-grained search for small detail | 68.1 | 69.6 | 83.2 | **90.1 / 88.5** | **84.3 / 86.4** |
| **CountBench** | counting small repeated objects | 80.0 | 79.2 | 90.0 | **97.2** | **96.3** |
| **RefCOCO (avg)** | referring-expression grounding | — | — | 89.3 | **89.7** | **88.1** |
| **OCRBench** | small-text legibility | 75.3 | 82.5 | 83.9 | **89.2** | **85.0** |
| CC-OCR | multi-scenario OCR | 58.9 | 72.9 | 77.8 | 79.3 | 76.7 |
| OmniDocBench 1.5 | document structure parsing | 55.9 | 79.4 | 86.8 | 87.7 | 86.2 |
| RealWorldQA | general real-photo VQA | 71.8 | 72.2 | 77.4 | 80.3 | 79.5 |
| HallusionBench | seeing things that aren't there | 58.4 | 64.5 | 66.0 | 69.3 | 65.0 |

Three readings, in decreasing confidence:

1. **The VlmsAreBlind gap (93.7 / 92.6 vs 72.5) is the most relevant single number in this note**, and
   it is enormous. A 21-point gap on a low-level-perception benchmark, in favour of a *smaller* model,
   is exactly the signal you want when the task is "can you tell sharp from blurry."
2. **Qwen3.5-4B is within a couple of points of Qwen3.5-9B on every acuity benchmark** (92.6 vs 93.7;
   96.3 vs 97.2; 88.1 vs 89.7; 85.0 vs 89.2) while being roughly half the size and, by memory-bandwidth
   arithmetic, roughly twice the speed. If the pilot shows the 4B holding up, the size question is
   settled.
3. **These are almost certainly thinking-mode numbers.** The card documents thinking as the default and
   gives separate sampling parameters for thinking and non-thinking modes; no non-thinking benchmark
   column is published. **How much of the VlmsAreBlind and V\* advantage survives
   `enable_thinking=false` is unknown and unverifiable from published sources.** This is the single
   biggest open risk in the recommendation and is precisely why the pilot exists.

For **Qwen3-VL** the architectural argument has to substitute for numbers. The card names **DeepStack**,
which *"fuses multi-level ViT features to capture fine-grained details and sharpen image–text
alignment"*, claims *"stronger 2D grounding"*, and describes OCR that is *"robust in low light, blur,
and tilt"* ([card](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)). Blur robustness is a
double-edged property here — a model trained to read through blur may be *less* inclined to report a
part as illegible. Worth watching in the pilot as a specific failure mode: over-reporting legibility.

For **Gemma 4** the published vision row is MMMU Pro, OmniDocBench 1.5, MATH-Vision and MedXPertQA MM
only ([card](https://huggingface.co/google/gemma-4-E4B-it)). E4B scores **MMMU Pro 52.6%** and
**MATH-Vision 59.5%**; 12B Unified scores 69.1% and 79.7%. These are multimodal *reasoning* benchmarks.
**There is no published Gemma 4 result on any acuity, counting, grounding or referring-expression
benchmark**, so there is no evidence either way about the property this task needs. Given that a
measured n=4 already showed E4B underperforming, the absence of evidence is not a reason to hope.

Gemma 4 does have one genuinely relevant knob, though, and it cuts against naive speed tuning:
**a configurable visual token budget of 70 / 140 / 280 / 560 / 1120 tokens**, where *"a higher token
budget preserves more visual detail at the cost of additional compute, while a lower budget enables
faster inference for tasks that don't require fine-grained understanding"*
([card, §Variable Image Resolution](https://huggingface.co/google/gemma-4-12B-it)). This task *is* a
fine-grained-understanding task, so **1120 is the setting to test and the low budgets are a trap.**
**Finding 5 measured `prompt_tokens` of 111–139 for a 512 px photo plus ~25 tokens of text**, which
puts the image at roughly the 70-token floor. If that reading is right, E4B has been judging legibility
from a thumbnail's worth of tokens, and part of its measured weakness is a configuration artefact.
**I could not find where LM Studio exposes this setting**, so this remains the one open lead on Gemma 4
rather than a fix.

## 5. Structured output

**Verified working with image input on this machine (Finding 1), despite LM Studio's documentation
being silent on the vision case. The schema is the right way to get multi-label output.**

What is documented ([structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output)):

- `response_format: {type: "json_schema", json_schema: {...}}` on `/v1/chat/completions`; *"Doing this
  will cause the LLM to respond in valid JSON conforming to the schema provided."* The result arrives
  as a **string** in `choices[0].message.content` and must be `JSON.parse`d.
- **GGUF models use llama.cpp's grammar-based sampling APIs; MLX models use the
  [Outlines](https://github.com/dottxt-ai/outlines) library.** Both are logit-level constraints applied
  to the *text decoder*, which is why they are orthogonal to how the image was encoded — the mechanism
  has no reason to care that some prefix tokens came from a vision tower. mlx-engine's
  [`requirements.txt`](https://raw.githubusercontent.com/lmstudio-ai/mlx-engine/main/requirements.txt)
  pins both `outlines` and `llguidance`, confirming the constraint stack is present on the MLX path.
- The one documented caveat: *"Not all models are capable of structured output, particularly LLMs
  below 7B parameters."* This is a soft warning about instruction-following, not a hard architectural
  limit — but it is a reason to prefer the 8B/9B over the 4B if the 4B's JSON turns out sloppy, and a
  reason to keep the enum vocabularies short.

**The documentation gap is real but the behaviour is fine.** LM Studio's structured-output page says
nothing about vision models, and its chat-completions page does not document image input either — yet
both work. Finding 1 confirms schema-conforming JSON from image requests across nine calls against
`gemma-4-e4b-it`, on both the reasoning and non-reasoning paths. Re-check once per new model, since the
guarantee is per-architecture, but do not treat it as a risk.

Practical schema notes for this task:

- Model `angle` as a single `enum` and `legible_parts` as an `array` of `enum` with
  `uniqueItems: true`. A grammar/Outlines constraint makes the enum literally unrepresentable to
  violate, which removes the entire class of "the model said `side view`" parsing bugs.
- **A schema is what makes the `<|begin_of_box|>` problem disappear.** Those sentinels come from GLM's
  chat template wrapping free-text answers; under a JSON-schema constraint the decoder cannot emit
  them, because they are not in the grammar. The existing `label.mjs` already takes this approach and
  its comment says so.
- **Set `max_tokens` generously anyway.** The existing pilot script records that `max_tokens: 250`
  produced *empty* content with a reasoning model and looked like a broken endpoint — a schema
  constrains *what* tokens are legal, not how many the model spends thinking before it starts.
- Consider a third field, `notes` or `confidence`, only if you want it; every extra free-text field is
  extra tokens per image at 1,088× multiplier.

## 6. MLX vs GGUF on Apple Silicon

**MLX builds exist for every shortlisted model — this is no longer the historical gap it was.**
Verified on HuggingFace: `lmstudio-community/Qwen3-VL-4B-Instruct-MLX-{4,5,6,8}bit`,
`Qwen3-VL-8B-Instruct-MLX-{4,5,6,8}bit`, `Qwen3-VL-30B-A3B-Instruct-MLX-{4,5,6,8}bit`,
`Qwen3.5-{0.8B,2B,4B,9B}-MLX-{4,8}bit`, `gemma-4-E4B-it-MLX-{4,5,6,8}bit`,
`gemma-4-12B-it-MLX-{4,5,6,8}bit`. All are published by `lmstudio-community`, i.e. by LM Studio itself,
which is the strongest available signal that they load in LM Studio.

Two MLX-specific facts that matter more than raw tok/s:

- **Parallel vision predictions are an MLX-path feature.** LM Studio 0.4.13's changelog states
  *"mlx-engine v1.8.1 significantly improves performance and adds parallel predictions for
  vision-capable models such as Qwen 3.5/3.6 and Gemma 4"*
  ([changelog](https://lmstudio.ai/changelog/lmstudio-v0.4.13)). mlx-engine's source confirms it: there
  is a whole `mlx_engine/model_kit/batched_vision/` subsystem with a `BatchedVisionModelKit`, a
  continuous-batching generator, and a disk-backed vision prompt cache. **This is directly aimed at a
  1,088-image batch.** Note the inconsistency: LM Studio's
  [parallel-requests doc](https://lmstudio.ai/docs/app/advanced/parallel-requests) still says the
  feature works with *"llama.cpp engine, with MLX coming soon"* — that page appears stale relative to
  the changelog. Which one is current for the installed build is worth checking in the app.
- **mlx-vlm ships vision feature caching**, claimed at *"~11x+ speedup"* in prompt processing on
  multi-turn conversations ([mlx-vlm README](https://github.com/Blaizzy/mlx-vlm/blob/main/README.md)).
  That is a multi-turn number and **does not apply to a one-image-one-turn batch**, where every image
  is a cache miss by construction. Do not budget for it.

**On measured MLX-vs-GGUF speed I have to report a gap.** I found **no first-party, reproducible
head-to-head benchmark for these vision models**. What exists is user-reported and contradictory:
LM Studio's own bug tracker carries reports both that MLX is much faster on small models and much
slower on large ones, with an inflection point users place around ~22B
([mlx-engine issue #101](https://github.com/lmstudio-ai/mlx-engine/issues/101),
[lmstudio-bug-tracker issue #258](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/258)), and
llama.cpp has an open issue reporting llama.cpp at roughly a third of MLX's generation speed for a
recent Qwen model on Apple Silicon
([llama.cpp issue #19366](https://github.com/ggml-org/llama.cpp/issues/19366)). **These are individual
user reports on unrelated hardware and should not be planned around.** Every model on this shortlist is
well below the ~22B inflection point, so the folk wisdom points toward MLX — but the only trustworthy
number is one measured on the M1 Air with the actual images. Run both formats on the same 30-photo
pilot; it costs minutes.

**A back-of-envelope bound for the M1 Air, offered as arithmetic and not as a measurement.**
Single-stream decode on Apple Silicon is memory-bandwidth-bound: 68 GB/s ÷ 5.63 GB (Qwen3.5-9B Q4_K_M)
≈ **12 tok/s ceiling**; ÷ 2.71 GB (Qwen3.5-4B Q4_K_M) ≈ **25 tok/s ceiling**. A schema-constrained
answer for this task is roughly 30–50 tokens. Prefill is the other half: at 512 px with
`patch_size=16` and `spatial_merge_size=2`, a 512×512 image becomes **256 visual tokens**
(512/16 = 32 per side → 1024 patches → ÷4) — cheap. So a plausible non-thinking single-stream figure is
**~3–5 s/image for the 9B and ~2–3 s for the 4B**, i.e. **55–90 minutes** and **35–55 minutes** for
1,088 photos before any concurrency. Concurrency at the default 4 should improve on that substantially,
because batching converts bandwidth-bound decode into compute-bound decode. **Every number in this
paragraph is derived, not observed.**

**On the P4000:** the arithmetic is just addition. 8 GB VRAM, minus a CUDA context, minus KV cache,
minus the mmproj (which llama.cpp offloads to GPU by default; `--no-mmproj-offload` disables it —
[multimodal docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)). At **2.95 GB**
Qwen3-VL-4B-Instruct fits with room to spare; at **3.39 GB** Qwen3.5-4B does too; at **5.78 GB**
Qwen3-VL-8B is tight and at **6.55 GB** Qwen3.5-9B is not realistic. Separately, **GP104 (Pascal,
sm_61) has no fast FP16 path** — its FP16 rate is a small fraction of FP32 — so the ViT prefill will run
in FP32. For a ~450M-parameter tower on 1,024 patches that is a fraction of a second against the
P4000's ~5 TFLOPS FP32, so it is unlikely to dominate; **but this specific interaction I could not
verify against llama.cpp's Pascal code paths and it should be measured, not assumed.** The P4000's
243 GB/s is 3.5× the Air's bandwidth, so if the 4B fits, that box is likely the faster batch runner
despite the older architecture.

## 7. Alternatives to a generative VLM

### Open-vocabulary detectors (OWLv2 / OWL-ViT via onnxruntime)

**Verified available.** `onnx-community/owlv2-base-patch16-ensemble-ONNX` exists and ships a single
fused `model.onnx` at 614 MB fp32, with `model_fp16.onnx` (307 MB), `model_q4f16.onnx` (128 MB) and
int8/uint8 variants. `Xenova/owlvit-base-patch32` likewise exists with the same variant spread. Also
present and not previously considered: `onnx-community/owlv2-large-patch14-ensemble-ONNX` and
`onnx-community/grounding-dino-tiny-ONNX`. Both OWL repos are tagged `transformers.js`; they are
ordinary ONNX graphs and load in Python `onnxruntime`, but **you must reimplement the preprocessing**,
which for OWLv2 is pad-to-square then resize to **960×960** with CLIP normalization
(`preprocessor_config.json`, `Owlv2ImageProcessor`).

The 960×960 / patch-16 geometry is genuinely attractive for this task — 60×60 = 3,600 candidate
locations, far finer than OWL-ViT base-patch32's 768/32 = 24×24. **Feed it the full-resolution
original, not the 512 px downscale**; upsampling 512→960 adds no information and throws away the
detector's main advantage.

**What boxes actually buy you, and it is the strongest argument in this section:** a box gives
**area** and a **crop**, and a crop gives a *measurable* sharpness statistic (variance-of-Laplacian, or
high-frequency energy ratio). Legibility then becomes `area > A ∧ sharpness > S` — an explicit,
tunable, auditable rule with two numbers you can move after seeing the results, rather than a model's
opaque interior judgement that you can only re-prompt at. For 1,088 photos that you will later want to
re-threshold, that is worth a lot.

**Why it is still not the answer:**

- **Part-level open-vocabulary detection is documented to be weak.** The PACO benchmark exists
  precisely because part-level detection is hard — 456 object-part categories over 75 objects
  ([PACO, arXiv:2301.01795](https://arxiv.org/pdf/2301.01795)) — and open-vocabulary detectors show
  limited performance on it. More directly, *"The Devil is in the Fine-Grained Details: Evaluating
  Open-Vocabulary Object Detectors for Fine-Grained Understanding"* (CVPR 2024,
  [arXiv:2311.17518](https://arxiv.org/abs/2311.17518)) finds that *"most existing solutions, which
  shine in standard open-vocabulary benchmarks, struggle to accurately capture and distinguish finer
  object details."* OWL-family models additionally cannot use text queries beyond ~16 tokens, so you
  cannot prompt your way around it with a careful description.
- **The vocabulary problem is fatal for two of the six labels.** "scopa" and "corbicula" are
  entomological terms; OWLv2's text tower is CLIP trained on web alt-text and will not have a usable
  embedding for them. "abdomen" on an insect is likewise not the web's dominant sense of the word.
  OWLv2 realistically gives you **head**, **wing**, **legs** and a whole-insect box — three of six,
  and the whole-insect box you already have.
- **You already have the whole-subject box, measured and good.** Apple's
  `VNGenerateObjectnessBasedSaliencyImageRequest` is in use on this project and performed well, so the
  detector's marginal value is strictly **per-part** boxes. That narrows the payoff to head/wing/legs.
- **Detection ≠ legibility.** OWLv2 will happily box a blurry wing with high confidence. The legibility
  judgement still has to come from the sharpness statistic you compute yourself, which is the useful
  half — and which does not actually require OWLv2 if you can get a box some other way.

**Verdict: not a better fit for multi-label legibility, but the best available calibration instrument.**
Concretely: run OWLv2-base-patch16-ensemble over the pilot subset for `["bee head", "insect wing",
"insect leg"]` only, compute box-area and Laplacian variance per crop, and use the resulting
distribution to (a) sanity-check whether the VLM's `wing` label correlates with anything measurable and
(b) pick the human-facing definition of "legible" that the prompt should encode. That is a few hours of
work that makes the VLM's output defensible; it is not a replacement pipeline.

**A cheaper path to the same boxes: ask the VLM.** Qwen3-VL's own documentation says *"Using relative
position coordinates, it supports both boxes and points, allowing for diverse combinations of
positioning and labeling tasks"* ([Qwen3-VL repo](https://github.com/QwenLM/Qwen3-VL)), and Gemma 4's
card lists *"Object detection … and pointing"* among its image capabilities
([card](https://huggingface.co/google/gemma-4-12B-it)). If the shortlisted model can emit a box for
"the wing" inside the same schema-constrained call, you get the crop for free with no second model, no
onnxruntime dependency, and no 960×960 preprocessing to reimplement. **This is untested and its
accuracy is unknown — but it is one extra schema field away and should be tried before building an
ONNX pipeline.**

### CLIP / SigLIP zero-shot similarity ranking

**Verdict: do not build this.** It returns a *ranking over prompt strings*, so multi-label output
requires a per-label decision threshold, and there is no principled way to set six thresholds without
labelled data — which is the thing this whole exercise is trying to produce. It also has no natural
representation for "present but illegible": a blurry wing and a sharp wing both match "a photo of a
bee's wing," because CLIP-family training never had a reason to separate them. Its one honest use is as
a **cheap second opinion**: run SigLIP over the VLM's output and flag disagreements for human review.
That is a QA tool, not a labeller.

### Two grounding models that look ideal and are not usable here

- **`nvidia/LocateAnything-3B`** — a 3B VLM built for exactly this shape of problem: it *"emits a label
  plus normalized (0–1000) bounding-box or point coordinates"*, uses **Parallel Box Decoding** for
  *"up to 2.5× higher throughput"*, and is trained on 785M boxes across natural, document and GUI
  domains ([card](https://huggingface.co/nvidia/LocateAnything-3B)). GGUF ports exist and are popular.
  **They do not work in LM Studio.** The GGUF publisher states plainly: *"Requires the fork build. The
  LocateAnything `mtmd` integration is not yet in upstream llama.cpp. Build from
  github.com/yuuko-eth/llama.cpp @ `mtmd-grounders` — stock llama.cpp will not load these GGUFs"*
  ([yuuko-eth/LocateAnything-3B-GGUF](https://huggingface.co/yuuko-eth/LocateAnything-3B-GGUF)). I
  independently confirmed there is no LocateAnything/Eagle architecture in llama.cpp's
  `llama-arch.cpp` or `clip-impl.h` at master. There *is* a `locateanything` module in mlx-vlm and
  `mlx-community/LocateAnything-3B-{4,8}bit` builds exist, so the MLX path **may** work in LM Studio —
  **I could not verify this and it is not in mlx-engine's test suite.** Separately, the model is under
  the NVIDIA license: *"non-commercial / research use only."* Worth a 20-minute try on the MLX path;
  not worth planning around.
- **`facebook/sam3` / `sam3.1`** — promptable concept segmentation would give per-part masks, which is
  strictly better than boxes for an area-and-sharpness estimator. mlx-vlm has `sam3` and `sam3_1`
  modules. But it is not an LM Studio chat model, the ONNX ports on HuggingFace are mostly the
  *tracker* variant with near-zero downloads, and there is no llama.cpp path at all. **Out of scope
  for a batch that needs to run this week**, but the right thing to revisit if per-part geometry
  becomes a recurring need.

## 8. Recommendation

**Download these three and run each over the same ~30 hand-labelled photos before committing:**

1. **`Qwen/Qwen3-VL-8B-Instruct-GGUF`** — `Qwen3VL-8B-Instruct-Q4_K_M.gguf` (5.03 GB) +
   `mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf` (0.75 GB). *Or* the MLX equivalent,
   `lmstudio-community/Qwen3-VL-8B-Instruct-MLX-4bit` (5.78 GB), which is in mlx-engine's tested set.
   **Why:** non-reasoning by checkpoint rather than by flag, which removes the whole class of failure
   that Findings 2 and 3 exposed — there is no template setting to get wrong and no `reasoning_effort`
   to remember. DeepStack is aimed at fine detail; native box/point output is a free hedge toward
   per-part geometry. This is the safe default.
2. **`Qwen/Qwen3-VL-4B-Instruct-GGUF`** — `Qwen3VL-4B-Instruct-Q4_K_M.gguf` (2.50 GB) +
   `mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf` (0.45 GB); MLX:
   `lmstudio-community/Qwen3-VL-4B-Instruct-MLX-4bit`. **Why:** the throughput baseline, and the only
   candidate that fits the P4000 with real headroom. If it matches the 8B on the pilot, the decision is
   made and the batch is under an hour.
3. **`lmstudio-community/Qwen3.5-9B-GGUF`** — `Qwen3.5-9B-Q4_K_M.gguf` (5.63 GB) +
   `mmproj-Qwen3.5-9B-BF16.gguf` (0.92 GB); MLX: `lmstudio-community/Qwen3.5-9B-MLX-4bit` (5.98 GB).
   **Run it with `reasoning_effort: "none"`** and confirm via `reasoning_tokens: 0` in the usage
   object; do **not** rely on `chat_template_kwargs`, which LM Studio ignores (Finding 3). If
   `reasoning_effort` turns out not to bind for this architecture, fall back to the prompt-template
   override (§3). **Why:** it posts by far the best fine-grained-acuity numbers available
   (VlmsAreBlind 93.7, V\* 90.1) and its vision path is confirmed to run on stock llama.cpp.
   **Swap in `lmstudio-community/Qwen3.5-4B-GGUF` (2.71 + 0.68 GB) instead if you want this experiment
   to also run on the P4000** — it gives up only ~1 point of VlmsAreBlind.

**On every call, for every model: pass `reasoning_effort: "none"` and assert
`usage.completion_tokens_details.reasoning_tokens === 0`.** This is a ~10× throughput difference on the
one model where it has been measured, and it is the difference between a 29-hour batch and a 3-hour
one. Add the assertion to `label.mjs` so a silently-reasoning model cannot cost thirteen hours before
anyone notices.

**`gemma-4-e4b-it` should be treated as a failed candidate, not a floor.** With reasoning off it
answered `dorsal` for 5/5 photos (Finding 4); with reasoning on it costs ~96 s/image (Finding 2). Its
one remaining chance is Finding 5 — the image appears to reach it at ~70–110 tokens, near Gemma 4's
*minimum* visual budget. **If LM Studio exposes that budget, re-run once at 1120 before discarding it;
otherwise discard it.** The same caution applies to Gemma 4 12B, which shares the mechanism.

**Do not download** Qwen3.6-27B (16.55 GB at Q4, exceeds the Air's total memory), any Qwen3-VL or
Qwen3.5 **Thinking** checkpoint, or LocateAnything-3B GGUF (needs a llama.cpp fork). **GLM-4.6V-Flash
is already on disk** — spend one request re-testing it with `reasoning_effort: "none"`, since the
Gemma 4 result means "its reasoning cannot be turned off" is no longer a safe assumption; but do not
plan around it, because it was picked by accident and nothing published suggests it beats Qwen3-VL
here.

**Two things to try before optimising the model choice, because either could dominate the model
decision** (the third — `reasoning_effort` — is no longer a "try", it is a requirement):

- **Turn up Max Concurrent Predictions** (default 4) and re-time the batch
  ([docs](https://lmstudio.ai/docs/app/advanced/parallel-requests)). On the MLX path this exercises
  mlx-engine's `BatchedVisionModelKit`, which LM Studio added specifically for vision models in 0.4.13.
- **Time GGUF against MLX for the same model on the M1 Air.** No trustworthy published number exists
  for these models; the pilot produces one in minutes.

## 9. What I could not verify

Listed so nothing here gets repeated as established fact.

**Resolved by measurement while writing this note** (previously open, now closed — see the
*Measured on this machine* section): whether `chat_template_kwargs` works in LM Studio (**it does
not**); whether `reasoning_effort` is a working alternative (**it is, on Gemma 4**); and whether
grammar-constrained structured output composes with image input (**it does**).

Still unverified:

- **Whether `reasoning_effort: "none"` binds for Qwen3.5 and Qwen3-VL.** It was tested only against
  `gemma-4-e4b-it`, which is the model that happened to be loaded. It is an LM Studio-side parameter,
  so it plausibly generalises, but the mapping from `reasoning_effort` to a per-architecture template
  behaviour is not documented anywhere I could find. Check `reasoning_tokens` per model.
- **Where LM Studio exposes Gemma 4's visual token budget.** Finding 5 is an *inference* from
  `prompt_tokens` (111–139 for image + ~25 tokens of text) against the card's documented budget ladder
  of 70/140/280/560/1120. I did not find the setting in LM Studio's docs or confirm the budget
  directly, and the token accounting could in principle be reported differently than I assume.
- **Qwen3.5's non-thinking accuracy.** All published Qwen3.5 vision numbers are, as far as I can tell,
  thinking-mode numbers; the card documents thinking as the default and publishes no non-thinking
  column. The VlmsAreBlind / V\* advantage may shrink substantially with thinking off.
- **Numeric benchmarks for Qwen3-VL-8B/4B-Instruct.** The model card and the GitHub repo publish
  performance only as **rendered chart images**, with no numeric table in text. The Qwen3-VL figures
  quoted above (30B-A3B) come from *Qwen3.5's* comparison table, i.e. from a competing model's card.
- **Any first-party MLX-vs-GGUF speed measurement for these vision models.** Only user reports on
  unrelated hardware exist, and they contradict each other.
- **Whether LM Studio's parallel-vision batching is live in the installed build.** The 0.4.13 changelog
  says mlx-engine v1.8.1 added it; LM Studio's parallel-requests doc still says MLX is "coming soon".
  One of the two is stale. The app rebranded to **Bionic 1.0.x** in July 2026 (current: Bionic 1.0.5,
  2026-08-05, per [lmstudio.ai/changelog](https://lmstudio.ai/changelog)), so the 0.4.x-era docs may
  simply not have been carried forward.
- **Whether LM Studio exposes mlx-vlm's `--thinking-budget`.** It is in mlx-vlm's CLI; it is not in
  LM Studio's API docs.
- **Whether `mlx-community/LocateAnything-3B-4bit` loads in LM Studio.** mlx-vlm has the architecture;
  mlx-engine's test suite does not cover it.
- **The P4000's FP16 behaviour under llama.cpp's vision path.** GP104 is sm_61 with no fast FP16, so
  the ViT should run in FP32; the compute budget suggests this is not a bottleneck, but I did not
  verify llama.cpp's actual Pascal code path.
- **Every per-image timing estimate in §6** is memory-bandwidth arithmetic, not a measurement. The
  only measured timings in this note are the `gemma-4-e4b-it` figures in the *Measured on this machine*
  section, and they were taken on a machine that was simultaneously running a research agent — treat
  them as an upper bound on wall time, though the token counts are exact.
- **The n is tiny.** Five photographs. The `dorsal`-5/5 collapse is a strong enough signal to act on,
  but it is not a measurement of accuracy; the pilot at n≈30 with hand labels is still required.
