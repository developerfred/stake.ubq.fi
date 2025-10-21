import { useAppKitAccount } from "@reown/appkit/react";
import { usePublicClient, useReadContract, useWriteContract } from "wagmi";
import erc20Abi from "../abis/erc20.ts";
import { stakingContract } from "../constants/contracts.ts";
import { BaseError, formatUnits, parseUnits } from "viem";
import { useErc20Token } from "../hooks/erc20Token.ts";
import { useState } from "react";
import { waitForTransactionReceipt } from "viem/actions";
import { useStatusMessage } from "../context/status-message.tsx";
import { Button } from "./button.tsx";

interface PoolDisplayProps {
  poolId?: bigint;
}

export function PoolDisplay({ poolId = 0n }: PoolDisplayProps) {
  const { address, isConnected } = useAppKitAccount();
  const { writeContract } = useWriteContract();
  const publicClient = usePublicClient();

  const { setErrorMessage, setSuccessMessage, clearMessages } = useStatusMessage();

  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isUnstaking, setIsUnstaking] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const stakingSettings = useReadContract({
    ...stakingContract,
    functionName: "getStakingSettings",
    args: [],
  });
  
  const poolInfo = useReadContract({
    ...stakingContract,
    functionName: "getStakingPoolInfo",
    args: [poolId],
  });
  
  const lpTokenAddress = poolInfo.data?.lpToken;
  const lpTokenInfo = useErc20Token(lpTokenAddress);
  const rewardTokenAddress = stakingSettings.data?.[0];
  const rewardTokenInfo = useErc20Token(rewardTokenAddress);

  const userInfo = useReadContract({
    ...stakingContract,
    functionName: "getStakingUserInfo",
    args: [poolId, address ?? "0x0"],
    query: {
      enabled: isConnected && !!address,
    },
  });
  
  const pendingRewards = useReadContract({
    ...stakingContract,
    functionName: "getPendingStakingRewards",
    args: [poolId, address ?? "0x0"],
    query: {
      enabled: isConnected && !!address,
    },
  });

  const allowance = useReadContract({
    abi: erc20Abi,
    address: lpTokenAddress,
    functionName: "allowance",
    args: [address ?? "0x0", stakingContract.address],
    query: {
      enabled: isConnected && !!address && !!lpTokenAddress,
    },
  });
  
  const balance = useReadContract({
    abi: erc20Abi,
    address: lpTokenAddress,
    functionName: "balanceOf",
    args: [address ?? "0x0"],
    query: {
      enabled: isConnected && !!address && !!lpTokenAddress,
    },
  });

  const onSuccess = async (hash: `0x${string}`) => {
    if (!publicClient) {
      setErrorMessage("No public client available");
      return;
    }
    
    try {
      const receipt = await waitForTransactionReceipt(publicClient, { 
        hash,
        timeout: 60_000,
      });
      
      if (receipt.status === "success") {
        setSuccessMessage("Transaction confirmed");
      } else {
        setErrorMessage("Transaction reverted");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transaction failed");
    }
    refreshData();
  };

  const onError = (error: unknown) => {
    if (error instanceof BaseError) {
      const shortMessage = error.shortMessage || error.message;
      setErrorMessage(shortMessage);
    } else if (error instanceof Error) {
      setErrorMessage(error.message);
    } else {
      setErrorMessage("An unknown error occurred");
    }
  };

  const claim = () => {
    clearMessages();
    setIsClaiming(true);
    writeContract(
      {
        ...stakingContract,
        functionName: "unstake",
        args: [poolId, 0n],
      },
      {
        onSuccess: onSuccess,
        onError: onError,
        onSettled: () => {
          setIsClaiming(false);
        },
      }
    );
  };

  const stake = () => {
    if (!lpTokenInfo.data) return;
    clearMessages();
    setIsStaking(true);
    writeContract(
      {
        ...stakingContract,
        functionName: "stake",
        args: [poolId, parseUnits(stakeAmount, lpTokenInfo.data.decimals)],
      },
      {
        onSuccess: onSuccess,
        onError: onError,
        onSettled: () => {
          setIsStaking(false);
        },
      }
    );
  };

  const unstake = () => {
    if (!lpTokenInfo.data) return;
    clearMessages();
    setIsUnstaking(true);
    writeContract(
      {
        ...stakingContract,
        functionName: "unstake",
        args: [poolId, parseUnits(unstakeAmount, lpTokenInfo.data.decimals)],
      },
      {
        onSuccess: onSuccess,
        onError: onError,
        onSettled: () => {
          setIsUnstaking(false);
        },
      }
    );
  };

  const approveAllowance = () => {
    if (!lpTokenAddress || !lpTokenInfo.data) return;
    clearMessages();
    setIsApproving(true);
    writeContract(
      {
        abi: erc20Abi,
        address: lpTokenAddress,
        functionName: "approve",
        args: [stakingContract.address, parseUnits(stakeAmount, lpTokenInfo.data.decimals)],
      },
      {
        onSuccess: onSuccess,
        onError: onError,
        onSettled: () => {
          setIsApproving(false);
        },
      }
    );
  };

  const refreshData = () => {
    poolInfo.refetch();
    userInfo.refetch();
    pendingRewards.refetch();
    allowance.refetch();
    balance.refetch();
  };

  // Error handling
  if (
    stakingSettings.error ||
    lpTokenInfo.error ||
    rewardTokenInfo.error ||
    poolInfo.error ||
    (isConnected && (pendingRewards.error || userInfo.error || allowance.error || balance.error))
  ) {
    return (
      <div className="pool-container">
        <div style={{ padding: "20px", color: "#ff6666" }}>
          Failed to load pool data. Please check your connection and try again.
        </div>
      </div>
    );
  }

  // Loading state
  if (
    stakingSettings.data === undefined ||
    lpTokenInfo.data === undefined ||
    rewardTokenInfo.data === undefined ||
    poolInfo.data === undefined ||
    (isConnected &&
      (pendingRewards.data === undefined || userInfo.data === undefined || allowance.data === undefined || balance.data === undefined))
  ) {
    return (
      <div className="pool-container">
        <div className="loading-container">
          <div className="spinner button-spinner"></div>
          <span>Loading pool information...</span>
        </div>
      </div>
    );
  }

  const parsedStakeAmount = !Number.isNaN(Number(stakeAmount)) ? parseUnits(stakeAmount, lpTokenInfo.data.decimals) : null;
  const parsedUnstakeAmount = !Number.isNaN(Number(unstakeAmount)) ? parseUnits(unstakeAmount, lpTokenInfo.data.decimals) : null;

  const isAllowanceSufficient = allowance.data !== undefined && parsedStakeAmount !== null ? allowance.data >= parsedStakeAmount : false;

  const rewardPerBlock = stakingSettings.data[3];
  const poolAllocPoints = poolInfo.data.allocationPoints;
  const totalAllocPoints = stakingSettings.data[6];
  const blocksPerDay = 7167;
  const poolRewardPerDay =
    totalAllocPoints > 0n
      ? Number(formatUnits((rewardPerBlock * poolAllocPoints) / totalAllocPoints, rewardTokenInfo.data.decimals)) * blocksPerDay
      : null;
  const userPoolShare =
    userInfo.data && poolInfo.data.amount > 0n
      ? Number(formatUnits(userInfo.data.amount, lpTokenInfo.data.decimals)) / Number(formatUnits(poolInfo.data.amount, lpTokenInfo.data.decimals))
      : null;
  const userRewardPerDay = userPoolShare && poolRewardPerDay && userInfo.data ? userPoolShare * poolRewardPerDay : null;

  const isWritingContract = isApproving || isStaking || isUnstaking || isClaiming;

  return (
    <div>
      <div className="pool-container">
        <div className="pool-title">{lpTokenInfo.data.name} Pool</div>
        <div>
          Total Staked: {formatUnits(poolInfo.data.amount, lpTokenInfo.data.decimals)} {lpTokenInfo.data.symbol}
        </div>
        <div>
          Your Stake: {userInfo.data ? formatUnits(userInfo.data.amount, lpTokenInfo.data.decimals) : "-"} {lpTokenInfo.data.symbol}{" "}
          {userPoolShare && userPoolShare > 0.0001 ? `(${(userPoolShare * 100).toFixed(2)}% of pool)` : ""}
        </div>

        <div className="stake-row-container">
          <div className="column-container">
            <div className="max-amount">
              Max:{" "}
              <span onClick={() => setStakeAmount(balance.data && lpTokenInfo.data ? formatUnits(balance.data, lpTokenInfo.data.decimals) : "")}>
                {balance.data !== undefined ? formatUnits(balance.data, lpTokenInfo.data.decimals) : "-"} {lpTokenInfo.data.symbol}
              </span>
            </div>
            <input type="text" pattern="\d*\.?\d*" placeholder="Amount" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} />
            <Button
              className="action-button"
              disabled={
                isWritingContract ||
                !isConnected ||
                balance.data === undefined ||
                isAllowanceSufficient ||
                !parsedStakeAmount ||
                parsedStakeAmount <= 0 ||
                parsedStakeAmount > balance.data
              }
              onClick={approveAllowance}
              isLoading={isApproving}
              isLoadingText="Approving..."
            >
              Approve
            </Button>
            <Button
              className="action-button"
              disabled={
                isWritingContract ||
                !isConnected ||
                balance.data === undefined ||
                !isAllowanceSufficient ||
                !parsedStakeAmount ||
                parsedStakeAmount <= 0 ||
                parsedStakeAmount > balance.data
              }
              onClick={stake}
              isLoading={isStaking}
              isLoadingText="Staking..."
            >
              Stake
            </Button>
          </div>
          <div className="column-container">
            <div className="max-amount">
              Max:{" "}
              <span
                onClick={() =>
                  setUnstakeAmount(userInfo.data && lpTokenInfo.data ? formatUnits(userInfo.data.amount, lpTokenInfo.data.decimals) : "")
                }
              >
                {userInfo.data ? formatUnits(userInfo.data.amount, lpTokenInfo.data.decimals) : "-"} {lpTokenInfo.data.symbol}
              </span>
            </div>
            <input type="text" pattern="\d*\.?\d*" placeholder="Amount" value={unstakeAmount} onChange={(e) => setUnstakeAmount(e.target.value)} />
            <Button
              className="action-button"
              disabled={
                isWritingContract ||
                !isConnected ||
                !userInfo.data ||
                balance.data === undefined ||
                !parsedUnstakeAmount ||
                parsedUnstakeAmount <= 0 ||
                parsedUnstakeAmount > userInfo.data.amount
              }
              onClick={unstake}
              isLoading={isUnstaking}
              isLoadingText="Unstaking..."
            >
              Unstake
            </Button>
          </div>
        </div>

        <div>
          <div>
            Pending Rewards:{" "}
            {pendingRewards.data !== undefined ? Number(formatUnits(pendingRewards.data, rewardTokenInfo.data.decimals)).toFixed(2) : "-"}{" "}
            {rewardTokenInfo.data.symbol}
          </div>
          <div>
            Reward Per Day: {userRewardPerDay !== null ? userRewardPerDay.toFixed(2) : "-"} {rewardTokenInfo.data?.symbol}
          </div>
          <Button
            className="action-button"
            onClick={claim}
            isLoading={isClaiming}
            isLoadingText="Claiming rewards..."
            disabled={isWritingContract || !isConnected || !pendingRewards.data}
          >
            Claim Rewards
          </Button>
        </div>
      </div>
    </div>
  );
}