import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, FlatList, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ChatHeader } from "@/components/ChatHeader";
import { MessageBubble } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { encryptMessage } from "@/lib/encryption";
import { Spacing } from "@/constants/theme";

interface ChatScreenProps {
  chatId: string;
  chatName: string;
  avatarUrl?: string;
  isOnline?: boolean;
  onBack: () => void;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export default function ChatScreen({
  chatId,
  chatName,
  avatarUrl,
  isOnline,
  onBack,
}: ChatScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  const [isSending, setIsSending] = useState(false);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/chats", chatId, "messages"],
    refetchInterval: 3000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const encryptedContent = encryptMessage(content);
      const response = await apiRequest("POST", `/api/chats/${chatId}/messages`, {
        content,
        encryptedContent,
      });
      return response.json();
    },
    onMutate: async (content) => {
      setIsSending(true);
      
      await queryClient.cancelQueries({ queryKey: ["/api/chats", chatId, "messages"] });
      
      const previousMessages = queryClient.getQueryData<Message[]>(["/api/chats", chatId, "messages"]);
      
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        createdAt: new Date().toISOString(),
        senderId: user?.id || "",
        sender: {
          id: user?.id || "",
          displayName: user?.displayName || "",
          avatarUrl: user?.avatarUrl,
        },
      };
      
      queryClient.setQueryData<Message[]>(
        ["/api/chats", chatId, "messages"],
        (old) => [...(old || []), optimisticMessage]
      );
      
      return { previousMessages };
    },
    onError: (err, content, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ["/api/chats", chatId, "messages"],
          context.previousMessages
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats", chatId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onSettled: () => {
      setIsSending(false);
    },
  });

  useEffect(() => {
    apiRequest("POST", `/api/chats/${chatId}/read`).catch(console.error);
  }, [chatId, messages.length]);

  const handleSend = (content: string) => {
    if (!content.trim()) return;
    sendMessageMutation.mutate(content);
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isSent = item.senderId === user?.id;
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const isFirstInGroup = !previousMessage || previousMessage.senderId !== item.senderId;
    
    return (
      <MessageBubble
        content={item.content}
        timestamp={formatMessageTime(item.createdAt)}
        isSent={isSent}
        senderName={item.sender.displayName}
        showSenderName={false}
        isFirstInGroup={isFirstInGroup}
        index={index}
      />
    );
  }, [user?.id, messages]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <EmptyState
        title="No Messages"
        description="Send a message to start the conversation"
        showImage={false}
      />
    </View>
  );

  const headerHeight = insets.top + Spacing.chatHeaderHeight;

  return (
    <ThemedView style={styles.container}>
      <ChatHeader
        name={chatName}
        avatarUrl={avatarUrl}
        isOnline={isOnline}
        onBackPress={onBack}
      />
      
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
            <LoadingState message="Loading messages..." />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages.length > 0 ? [...messages].reverse() : []}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            inverted={messages.length > 0}
            contentContainerStyle={[
              styles.messageList,
              { 
                paddingTop: Spacing.lg,
                paddingBottom: headerHeight,
              },
              messages.length === 0 && styles.emptyList,
            ]}
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              if (messages.length > 0) {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              }
            }}
          />
        )}
        
        <MessageInput onSend={handleSend} disabled={isSending} />
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: Spacing.lg,
    flexGrow: 1,
  },
  emptyList: {
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    transform: [{ scaleY: -1 }],
  },
});
