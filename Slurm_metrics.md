Here is the complete list of all Slurm exported metrics from the OpenMetrics plugin:

Node Metrics (per node)

slurm_node_cpus{node=<name>} - Total CPUs in node
slurm_node_cpus_alloc{node=<name>} - Allocated CPUs
slurm_node_cpus_effective{node=<name>} - Effective CPUs (excluding CoreSpec)
slurm_node_cpus_idle{node=<name>} - Idle CPUs
slurm_node_gpus{node=<name>} - Total GPUs
slurm_node_gpus_alloc{node=<name>} - Allocated GPUs
slurm_node_memory_alloc_bytes{node=<name>} - Allocated memory
slurm_node_memory_effective_bytes{node=<name>} - Effective memory
slurm_node_memory_free_bytes{node=<name>} - Free memory
slurm_node_memory_bytes{node=<name>} - Total memory
Node State Aggregates

slurm_nodes - Total nodes
slurm_nodes_alloc - Allocated state
slurm_nodes_blocked - Blocked state
slurm_nodes_completing - Completing flag
slurm_nodes_cloud - Cloud nodes
slurm_nodes_down - Down state
slurm_nodes_drain - Drain flag
slurm_nodes_drained - Drained state
slurm_nodes_draining - Draining (with active jobs)
slurm_nodes_dyn_future - Future dynamic nodes
slurm_nodes_dyn_normal - Dynamic nodes
slurm_nodes_external - External nodes
slurm_nodes_fail - Fail flag
slurm_nodes_future - Future state
slurm_nodes_idle - Idle state
slurm_nodes_invalid_reg - Invalid registration
slurm_nodes_maint - Maintenance flag
slurm_nodes_mixed - Mixed state
slurm_nodes_noresp - Not responding
slurm_nodes_planned - Planned flag
slurm_nodes_power_down - Marked for power down
slurm_nodes_power_up - Marked for power up
slurm_nodes_powered_down - Powered down
slurm_nodes_powering_up - Powering up
slurm_nodes_reboot_issued - Reboot issued
slurm_nodes_reboot_req - Reboot requested
slurm_nodes_resv - Reserved flag
slurm_nodes_unknown - Unknown state
Job Metrics (Aggregate)

slurm_jobs_bootfail - BootFail state
slurm_jobs_cancelled - Cancelled state
slurm_jobs_completed - Completed state
slurm_jobs_completing - Completing state
slurm_jobs_configuring - Configuring state
slurm_jobs_cpus_alloc - CPUs allocated
slurm_jobs_deadline - Deadline state
slurm_jobs_expediting - Expediting state
slurm_jobs_failed - Failed state
slurm_jobs_fed_requeued - Federated requeued
slurm_jobs_finished - Finished jobs
slurm_jobs_gpus_alloc - GPUs allocated
slurm_jobs_hold - Hold state
slurm_jobs - Total jobs
slurm_jobs_memory_alloc - Memory allocated (bytes)
slurm_jobs_node_failed - Node failed state
slurm_jobs_nodes_alloc - Nodes allocated
slurm_jobs_outofmemory - Out of memory state
slurm_jobs_pending - Pending state
slurm_jobs_powerup_node - PowerUp node state
slurm_jobs_preempted - Preempted state
slurm_jobs_requeued - Requeued state
slurm_jobs_resizing - Resizing state
slurm_jobs_revoked - Revoked state
slurm_jobs_running - Running state
slurm_jobs_signaling - Being signaled
slurm_jobs_stageout - StageOut state
slurm_jobs_started - Started jobs
slurm_jobs_suspended - Suspended state
slurm_jobs_timeout - Timeout state
Partition Metrics (per partition {partition=<name>})

slurm_partitions - Total partitions
slurm_partition_jobs{partition=<name>} - Jobs in partition
slurm_partition_jobs_* - All job state variants per partition (same as job metrics above)
slurm_partition_jobs_cpus_alloc{partition=<name>} - CPUs allocated
slurm_partition_jobs_gpus_alloc{partition=<name>} - GPUs allocated
slurm_partition_jobs_memory_alloc{partition=<name>} - Memory allocated
slurm_partition_jobs_max_job_nodes{partition=<name>} - Max nodes for pending jobs
slurm_partition_jobs_max_job_nodes_nohold{partition=<name>} - Excluding held jobs
slurm_partition_jobs_min_job_nodes{partition=<name>} - Min nodes for pending jobs
slurm_partition_jobs_min_job_nodes_nohold{partition=<name>} - Excluding held jobs
slurm_partition_jobs_wait_part_node_limit{partition=<name>} - Jobs waiting on node limits
slurm_partition_nodes_* - Node state metrics per partition
slurm_partition_nodes_cpus_efctv{partition=<name>} - Effective CPUs
slurm_partition_nodes_cpus_idle{partition=<name>} - Idle CPUs
slurm_partition_nodes_cpus_alloc{partition=<name>} - Allocated CPUs
slurm_partition_nodes_mem_alloc{partition=<name>} - Allocated memory
slurm_partition_nodes_mem_avail{partition=<name>} - Available memory
slurm_partition_nodes_mem_free{partition=<name>} - Free memory
slurm_partition_nodes_mem_tot{partition=<name>} - Total memory
slurm_partition_cpus{partition=<name>} - Total CPUs in partition
slurm_partition_gpus{partition=<name>} - Total GPUs in partition
slurm_partition_nodes{partition=<name>} - Total nodes in partition
User/Account Metrics (per user/account)

slurm_user_jobs_*{username=<name>} - All job state metrics per user
slurm_user_jobs_cpus_alloc{username=<name>} - User's CPU allocation
slurm_user_jobs_gpus_alloc{username=<name>} - User's GPU allocation
slurm_user_jobs_memory_alloc{username=<name>} - User's memory allocation
slurm_account_jobs_*{account=<name>} - All job state metrics per account
slurm_account_jobs_cpus_alloc{account=<name>} - Account's CPU allocation
slurm_account_jobs_gpus_alloc{account=<name>} - Account's GPU allocation
slurm_account_jobs_memory_alloc{account=<name>} - Account's memory allocation
Scheduling Metrics

slurm_agent_cnt - Agent thread count
slurm_agent_queue_size - Outgoing RPC queue length
slurm_agent_thread_cnt - Total active agent threads
slurm_bf_depth_mean - Mean backfill depth
slurm_bf_mean_cycle - Mean backfill cycle time
slurm_bf_mean_table_sz - Mean backfill table size
slurm_bf_queue_len_mean - Mean backfill queue length
slurm_bf_try_depth_mean - Mean depth attempts
slurm_backfilled_het_jobs - Heterogeneous backfilled
slurm_backfilled_jobs - Total backfilled since reset
slurm_bf_active - Backfill active jobs
slurm_bf_cycle_cnt - Backfill cycle count
slurm_bf_cycle_last - Last backfill cycle time
slurm_bf_cycle_max - Max backfill cycle time
slurm_bf_cycle_tot - Sum of backfill cycles
slurm_bf_depth_tot - Sum of backfill depths
slurm_bf_depth_try_tot - Sum of depth attempts
slurm_bf_last_depth - Last backfill depth
slurm_bf_last_depth_try - Last depth attempts
slurm_bf_queue_len - Backfill queue length
slurm_bf_queue_len_tot - Sum of queue lengths
slurm_bf_table_size - Backfill table size
slurm_bf_table_size_tot - Sum of table sizes
slurm_bf_when_last_cycle - Timestamp of last cycle
slurm_sdiag_jobs_canceled - Canceled since reset
slurm_sdiag_jobs_completed - Completed since reset
slurm_sdiag_jobs_failed - Failed since reset
slurm_sdiag_jobs_pending - Pending at timestamp
slurm_sdiag_jobs_running - Running at timestamp
slurm_sdiag_jobs_started - Started since reset
slurm_sdiag_jobs_submitted - Submitted since reset
slurm_sdiag_job_states_ts - Job states timestamp
slurm_last_backfilled_jobs - Backfilled since last cycle
slurm_sdiag_latency - Measurement latency
slurm_schedule_cycle_cnt - Scheduling cycle count
slurm_schedule_cycle_depth - Depth processed
slurm_schedule_cycle_last - Last cycle time
slurm_schedule_cycle_max - Max cycle time
slurm_schedule_cycle_tot - Sum of cycle times
slurm_schedule_queue_len - Jobs pending queue length
slurm_sched_exit_end - End of job queue
slurm_sched_exit_max_depth - Hit default queue depth
slurm_sched_exit_max_job_start - Hit max job start
slurm_sched_exit_lic - Blocked on licenses
slurm_sched_exit_rpc_cnt - Hit max RPC count
slurm_sched_exit_timeout - Timeout
slurm_bf_exit_end - Backfill queue end
slurm_bf_exit_max_job_start - Hit max job start
slurm_bf_exit_max_job_test - Hit max job test
slurm_bf_exit_state_changed - System state changed
slurm_bf_exit_table_limit - Hit table size limit
slurm_bf_exit_timeout - Timeout
slurm_sched_mean_cycle - Mean scheduling cycle time
slurm_sched_mean_depth_cycle - Mean cycle depth
slurm_server_thread_cnt - Active slurmctld threads
slurm_slurmdbd_queue_size - Queued messages to SlurmDBD
slurm_last_proc_req_start - Last process request timestamp
slurm_sched_stats_timestamp - Snapshot timestamp