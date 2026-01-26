import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ChatListItem } from "@/components/ChatListItem";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

interface ChatListScreenProps {
  onChatSelect: (chatId: string, chatName: string, avatarUrl?: string, isOnline?: boolean) => void;
}

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isOnline?: boolean;
}

interface ChatWithDetails {
  id: string;
  name?: string;
  isGroup?: boolean;
  avatarUrl?: string;
  participants: { user: User }[];
  lastMessage?: {
    content: string;
    createdAt: string;
    sender: User;
  };
  unreadCount: number;
}

export default function ChatListScreen({ onChatSelect }: ChatListScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForDelete, setSelectedForDelete] = useState<string | null>(null);

  const { data: chats = [], isLoading, refetch, isRefetching } = useQuery<ChatWithDetails[]>({
    queryKey: ["/api/chats"],
    refetchInterval: 5000,
  });

  const { data: searchResults = [], isLoading: isSearching } = useQuery<User[]>({
    queryKey: ["/api/users/search", searchQuery],
    queryFn: async () => {
      const baseUrl = (await import("@/lib/query-client")).getApiUrl();
      const url = new URL("/api/users/search", baseUrl);
      url.searchParams.set("q", searchQuery);
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search users");
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const createChatMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const response = await apiRequest("POST", "/api/chats", {
        participantIds: [participantId],
        isGroup: false,
      });
      return response.json();
    },
    onSuccess: (newChat) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      setShowNewChatModal(false);
      setSearchQuery("");
      
      const otherParticipant = newChat.participants?.find(
        (p: any) => p.user.id !== user?.id
      );
      
      onChatSelect(
        newChat.id,
        otherParticipant?.user.displayName || "Chat",
        otherParticipant?.user.avatarUrl,
        otherParticipant?.user.isOnline
      );
    },
  });

  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      await apiRequest("DELETE", `/api/chats/${chatId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      setSelectedForDelete(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const getChatDisplayInfo = (chat: ChatWithDetails) => {
    if (chat.isGroup) {
      return {
        name: chat.name || "Group Chat",
        avatarUrl: chat.avatarUrl,
        isOnline: false,
      };
    }
    
    const otherParticipant = chat.participants?.find(p => p.user.id !== user?.id);
    return {
      name: otherParticipant?.user.displayName || "Unknown User",
      avatarUrl: otherParticipant?.user.avatarUrl,
      isOnline: otherParticipant?.user.isOnline || false,
    };
  };

  const handleChatPress = (chat: ChatWithDetails) => {
    const displayInfo = getChatDisplayInfo(chat);
    onChatSelect(chat.id, displayInfo.name, displayInfo.avatarUrl, displayInfo.isOnline);
  };

  const handleLongPress = (chatId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedForDelete(chatId);
  };

  const renderChatItem = useCallback(({ item }: { item: ChatWithDetails }) => {
    const displayInfo = getChatDisplayInfo(item);
    
    return (
      <ChatListItem
        id={item.id}
        name={displayInfo.name}
        avatarUrl={displayInfo.avatarUrl}
        lastMessage={item.lastMessage?.content}
        timestamp={item.lastMessage ? formatTimestamp(item.lastMessage.createdAt) : undefined}
        unreadCount={item.unreadCount}
        isOnline={displayInfo.isOnline}
        onPress={() => handleChatPress(item)}
        onLongPress={() => handleLongPress(item.id)}
      />
    );
  }, [user?.id]);

  const renderUserItem = ({ item }: { item: User }) => (
    <Pressable
      style={[styles.userItem, { borderBottomColor: theme.border }]}
      onPress={() => createChatMutation.mutate(item.id)}
    >
      <Avatar uri={item.avatarUrl} size="medium" showOnlineStatus isOnline={item.isOnline} />
      <View style={styles.userInfo}>
        <ThemedText style={styles.userName}>{item.displayName}</ThemedText>
        <ThemedText style={[styles.userUsername, { color: theme.textSecondary }]}>
          @{item.username}
        </ThemedText>
      </View>
    </Pressable>
  );

  if (isLoading) {
    return <LoadingState message="Loading chats..." />;
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.sm,
          paddingBottom: insets.bottom + 80,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Chats Yet"
            description="Start a conversation by tapping the button below"
            actionLabel="Start Chat"
            onAction={() => setShowNewChatModal(true)}
          />
        }
      />

      <Animated.View
        entering={FadeIn}
        style={[
          styles.fab,
          { 
            backgroundColor: theme.primary,
            bottom: insets.bottom + Spacing.lg,
          }
        ]}
      >
        <Pressable
          onPress={() => setShowNewChatModal(true)}
          style={styles.fabButton}
        >
          <Feather name="message-square" size={24} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      <Modal
        visible={showNewChatModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNewChatModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setShowNewChatModal(false)}>
              <ThemedText style={{ color: theme.primary }}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="h4">New Chat</ThemedText>
            <View style={{ width: 50 }} />
          </View>

          <View style={styles.searchContainer}>
            <View style={[styles.searchInput, { backgroundColor: theme.inputBackground }]}>
              <Feather name="search" size={20} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchTextInput, { color: theme.text }]}
                placeholder="Search users..."
                placeholderTextColor={theme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>
          </View>

          {searchQuery.length >= 2 ? (
            <FlatList
              data={searchResults}
              renderItem={renderUserItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ flexGrow: 1 }}
              ListEmptyComponent={
                isSearching ? (
                  <LoadingState message="Searching..." />
                ) : (
                  <EmptyState
                    title="No Users Found"
                    description="Try a different search term"
                    showImage={false}
                  />
                )
              }
            />
          ) : (
            <View style={styles.searchHint}>
              <ThemedText style={{ color: theme.textSecondary }}>
                Enter at least 2 characters to search
              </ThemedText>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={!!selectedForDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedForDelete(null)}
      >
        <Pressable 
          style={styles.deleteModalOverlay}
          onPress={() => setSelectedForDelete(null)}
        >
          <View style={[styles.deleteModal, { backgroundColor: theme.backgroundRoot }]}>
            <ThemedText type="h4" style={styles.deleteTitle}>
              Delete Chat?
            </ThemedText>
            <ThemedText style={[styles.deleteDescription, { color: theme.textSecondary }]}>
              This action cannot be undone.
            </ThemedText>
            <View style={styles.deleteActions}>
              <Button
                onPress={() => setSelectedForDelete(null)}
                style={[styles.deleteButton, { backgroundColor: theme.surfaceDark }]}
              >
                Cancel
              </Button>
              <Button
                onPress={() => selectedForDelete && deleteChatMutation.mutate(selectedForDelete)}
                style={[styles.deleteButton, { backgroundColor: theme.error }]}
              >
                Delete
              </Button>
            </View>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchContainer: {
    padding: Spacing.lg,
  },
  searchInput: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 16,
  },
  searchHint: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontWeight: "600",
    fontSize: 16,
  },
  userUsername: {
    fontSize: 14,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
  },
  deleteModal: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
  },
  deleteTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  deleteDescription: {
    textAlign: "center",
    marginBottom: Spacing["2xl"],
  },
  deleteActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  deleteButton: {
    flex: 1,
  },
});
