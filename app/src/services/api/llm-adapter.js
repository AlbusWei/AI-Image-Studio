/**
 * LLMAdapter – Prompt expansion using DashScope-compatible OpenAI-style API
 *
 * Model: qwen-max (via /api/llm proxy)
 * Endpoint: POST /api/llm/chat/completions
 */

import { apiPost } from './client.js';

/** System prompt that instructs the LLM to generate prompt variations. */
const SYSTEM_PROMPT = `你是一个专业的 AI 图像生成提示词工程师。你的任务是将用户提供的简短描述扩展为多个高质量的图像生成提示词。

规则：
1. 生成 3-5 个不同风格/视角/氛围的变体
2. 每个变体要具体、详细，包含画面构图、光影、色彩、风格等要素
3. 保持原始意图，但增加艺术性和视觉丰富度
4. 直接返回 JSON 数组格式，不要添加其他说明
5. 如果用户指定了特定模型，考虑该模型的特点

返回格式（纯 JSON 数组）：
["变体提示词1", "变体提示词2", "变体提示词3"]`;

export class LLMAdapter {
  constructor() {
    this.model = (typeof import.meta.env !== 'undefined' && import.meta.env?.VITE_EXPANSION_LLM_MODEL) || 'qwen-max';
  }

  /**
   * Expand a user prompt into multiple generation-ready variations.
   * @param {string} originalPrompt - the user's short description
   * @param {Object} [context] - { model, style, language }
   * @param {AbortSignal} [signal]
   * @returns {Promise<string[]>} array of expanded prompts
   */
  async expandPrompt(originalPrompt, context = {}, signal) {
    const userMessage = this._buildUserMessage(originalPrompt, context);

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: context.temperature ?? 0.7,
      max_tokens: 2000,
    };

    console.log('[LLMAdapter] Expand prompt request:');
    console.log('  URL: /api/llm/chat/completions');
    console.log('  Model:', this.model);
    console.log('  Prompt:', originalPrompt.slice(0, 80));

    try {
      const data = await apiPost('/llm/chat/completions', body, signal);
      console.log('[LLMAdapter] Response received, choices:', data?.choices?.length || 0);
      return this._parseResponse(data);
    } catch (err) {
      console.error('[LLMAdapter] Request failed:', err);
      throw err;
    }
  }

  /**
   * Build the user message with optional context hints.
   */
  _buildUserMessage(prompt, context) {
    let message = `请将以下描述扩展为多个图像生成提示词：\n\n"${prompt}"`;

    if (context.model) {
      message += `\n\n目标模型：${context.model}`;
    }
    if (context.style) {
      message += `\n风格偏好：${context.style}`;
    }
    if (context.language) {
      message += `\n输出语言：${context.language}`;
    }

    return message;
  }

  /**
   * Parse the LLM response and extract the JSON array of prompts.
   */
  _parseResponse(data) {
    try {
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('LLM returned empty response');
      }

      // Try to extract JSON array from the response
      // The LLM might wrap it in markdown code blocks
      let jsonStr = content.trim();

      // Remove markdown code fences if present
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }

      // Try to find array in the string
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('LLM response is not an array');
      }

      // Ensure all items are strings
      return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
    } catch (err) {
      console.error('[LLMAdapter] Parse error:', err, data);
      // Fallback: return the raw content as a single-item array
      const raw = data?.choices?.[0]?.message?.content || '';
      return raw.trim() ? [raw.trim()] : [];
    }
  }

  /**
   * Generic chat completion (for future features like caption generation, etc.)
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options] - { temperature, max_tokens }
   * @param {AbortSignal} [signal]
   * @returns {Promise<string>} assistant response text
   */
  async chat(messages, options = {}, signal) {
    const body = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
    };

    console.log('[LLMAdapter] Chat request:', { model: this.model, messageCount: messages.length });

    try {
      const data = await apiPost('/llm/chat/completions', body, signal);
      return data?.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.error('[LLMAdapter] Chat failed:', err);
      throw err;
    }
  }
}
