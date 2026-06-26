Metric Name	Type	Description
vllm:corrupted_requests	Counter	Corrupted requests, in terms of total number of requests with NaNs in logits.
vllm:external_prefix_cache_hits	Counter	External prefix cache hits from KV connector cross-instance cache sharing, in terms of number of cached tokens.
vllm:external_prefix_cache_queries	Counter	External prefix cache queries from KV connector cross-instance cache sharing, in terms of number of queried tokens.
vllm:generation_tokens	Counter	Number of generation tokens processed.
vllm:mm_cache_hits	Counter	Multi-modal cache hits, in terms of number of cached items.
vllm:mm_cache_queries	Counter	Multi-modal cache queries, in terms of number of queried items.
vllm:num_preemptions	Counter	Cumulative number of preemption from the engine.
vllm:prefix_cache_hits	Counter	Prefix cache hits, in terms of number of cached tokens.
vllm:prefix_cache_queries	Counter	Prefix cache queries, in terms of number of queried tokens.
vllm:prompt_tokens	Counter	Number of prefill tokens processed.
vllm:prompt_tokens_by_source	Counter	Number of prompt tokens by source.
vllm:prompt_tokens_cached	Counter	Number of cached prompt tokens (local + external).
vllm:request_success	Counter	Count of successfully processed requests.
vllm:engine_sleep_state	Gauge	Engine sleep state; awake = 0 means engine is sleeping; awake = 1 means engine is awake; weights_offloaded = 1 means sleep level 1; discard_all = 1 means sleep level 2.
vllm:kv_cache_usage_perc	Gauge	KV-cache usage. 1 means 100 percent usage.
vllm:lora_requests_info	Gauge	Running stats on lora requests.
vllm:num_requests_running	Gauge	Number of requests in model execution batches.
vllm:num_requests_waiting	Gauge	Number of requests waiting to be processed.
vllm:num_requests_waiting_by_reason	Gauge	Number of waiting requests by reason. Reason labels: 'capacity' = waiting for scheduling capacity; 'deferred' = deferred by transient constraints (LoRA budget, KV transfer, blocked status). Sum of all reasons equals vllm:num_requests_waiting.
vllm:e2e_request_latency_seconds	Histogram	Histogram of e2e request latency in seconds.
vllm:inter_token_latency_seconds	Histogram	Histogram of inter-token latency in seconds.
vllm:iteration_tokens_total	Histogram	Histogram of number of tokens per engine_step.
vllm:kv_block_idle_before_evict_seconds	Histogram	Histogram of idle time before KV cache block eviction. Sampled metrics (controlled by --kv-cache-metrics-sample).
vllm:kv_block_lifetime_seconds	Histogram	Histogram of KV cache block lifetime from allocation to eviction. Sampled metrics (controlled by --kv-cache-metrics-sample).
vllm:kv_block_reuse_gap_seconds	Histogram	Histogram of time gaps between consecutive KV cache block accesses. Only the most recent accesses are recorded (ring buffer). Sampled metrics (controlled by --kv-cache-metrics-sample).
vllm:request_decode_time_seconds	Histogram	Histogram of time spent in DECODE phase for request.
vllm:request_generation_tokens	Histogram	Number of generation tokens processed.
vllm:request_inference_time_seconds	Histogram	Histogram of time spent in RUNNING phase for request.
vllm:request_max_num_generation_tokens	Histogram	Histogram of maximum number of requested generation tokens.
vllm:request_params_max_tokens	Histogram	Histogram of the max_tokens request parameter.
vllm:request_params_n	Histogram	Histogram of the n request parameter.
vllm:request_prefill_kv_computed_tokens	Histogram	Histogram of new KV tokens computed during prefill (excluding cached tokens).
vllm:request_prefill_time_seconds	Histogram	Histogram of time spent in PREFILL phase for request.
vllm:request_prompt_tokens	Histogram	Number of prefill tokens processed.
vllm:request_queue_time_seconds	Histogram	Histogram of time spent in WAITING phase for request.
vllm:request_time_per_output_token_seconds	Histogram	Histogram of time_per_output_token_seconds per request.
vllm:time_to_first_token_seconds	Histogram	Histogram of time to first token in seconds.
Speculative Decoding Metrics¶

Metric Name	Type	Description
vllm:spec_decode_num_accepted_tokens	Counter	Number of accepted tokens.
vllm:spec_decode_num_accepted_tokens_per_pos	Counter	Accepted tokens per draft position.
vllm:spec_decode_num_draft_tokens	Counter	Number of draft tokens.
vllm:spec_decode_num_drafts	Counter	Number of spec decoding drafts.
NIXL KV Connector Metrics¶

Metric Name	Type	Description
vllm:nixl_num_failed_notifications	Counter	Number of failed NIXL KV Cache notifications.
vllm:nixl_num_failed_transfers	Counter	Number of failed NIXL KV Cache transfers.
vllm:nixl_num_kv_expired_reqs	Counter	Number of requests that had their KV expire. NOTE: This metric is tracked on the P instance.
vllm:nixl_bytes_transferred	Histogram	Histogram of bytes transferred per NIXL KV Cache transfers.
vllm:nixl_num_descriptors	Histogram	Histogram of number of descriptors per NIXL KV Cache transfers.
vllm:nixl_post_time_seconds	Histogram	Histogram of transfer post time for NIXL KV Cache transfers.
vllm:nixl_xfer_time_seconds	Histogram	Histogram of transfer duration for NIXL KV Cache transfers.
Model Flops Utilization (MFU) Performance Metrics¶

These metrics are available via --enable-mfu-metrics:

Metric Name	Type	Description
vllm:estimated_flops_per_gpu_total	Counter	Estimated number of floating point operations per GPU (for Model Flops Utilization calculations).
vllm:estimated_read_bytes_per_gpu_total	Counter	Estimated number of bytes read from memory per GPU (for Model Flops Utilization calculations).
vllm:estimated_write_bytes_per_gpu_total	Counter	Estimated number of bytes written to memory per GPU (for Model Flops Utilization calculations).